/**
 * The capture pipeline: one screenshot in, one durable, fully-organized memory out.
 *
 * Ordering matters. The image is stored and a row is written before analysis runs,
 * so a capture is never lost. Analysis then runs *synchronously* and the row is
 * completed in the same request.
 *
 * The previous pipeline returned instantly and backfilled analysis in a Vercel
 * `after()` callback. That left 77% of rows with no analysis at all and two rows
 * permanently displaying "pending analysis", because nothing retried and nothing
 * recorded the failure. Here a failure is written to the row as `failed` with the
 * reason, and /api/memories/repair can retry it.
 */

import { NextResponse } from "next/server";
import { AgentError, analyzeScreenshot } from "@/lib/agent";
import { getConfig } from "@/lib/config";
import {
  buildSearchText,
  completeMemory,
  createPendingMemory,
  failMemory,
  getMemory,
} from "@/lib/db/memories";
import { makeImagePath, uploadScreenshot } from "@/lib/db/storage";
import { signImageUrl } from "@/lib/db/storage";
import { validateImage } from "@/lib/image";
import { retrieve, toAnswerContext } from "@/lib/retrieval/retrieve";
import { synthesizeAnswer } from "@/lib/agent";
import type { CaptureMode, Memory, ScreenshotAnalysis } from "@/lib/schemas/memory";

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  // `detail` mirrors `error` so Shortcuts built against the previous API keep working.
  return NextResponse.json({ error: message, detail: message, ...extra }, { status });
}

function formText(form: FormData, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Questions that genuinely need the live web, versus ones the image already answers. */
function needsWebSearch(question: string | null): boolean {
  if (!question) return false;
  return /\b(similar|alternative|nearby|near me|current|today|latest|now|price|cheaper|reviews?|rating|open now|hours|in stock|compare|competitor|news)\b/i.test(
    question,
  );
}

/** Whether an Ask should also consult previously saved screenshots. */
function wantsMemoryContext(question: string | null): boolean {
  if (!question) return false;
  return /\b(similar|like this|others?|else|before|already|my |saved|previous|other times)\b/i.test(
    question,
  );
}

function analysisToRow(analysis: ScreenshotAnalysis): Partial<Memory> {
  return {
    title: analysis.title,
    content_type: analysis.content_type,
    intent_mode: analysis.intent_mode,
    intent_summary: analysis.intent_summary,
    description: analysis.description,
    ocr_text: analysis.ocr_text,
    tags: analysis.tags,
    entities: analysis.entities,
    actionable: analysis.actionable,
    urgency: analysis.urgency,
    due_on: analysis.due_on,
    event_on: analysis.event_on,
    suggested_actions: analysis.suggested_actions,
    event: analysis.event,
    place: analysis.place,
    person: analysis.person,
    product: analysis.product,
    answer: analysis.answer,
    citations: analysis.citations,
    confidence: analysis.confidence,
    analysis,
  };
}

export async function handleCapture(req: Request, forcedMode?: CaptureMode) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();
  const cfg = getConfig();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Request must be multipart/form-data with an image field.");
  }

  const mode = (forcedMode ||
    (formText(form, "mode") || "save").toLowerCase()) as CaptureMode;
  if (!["save", "ask", "describe"].includes(mode)) {
    return jsonError("mode must be one of: save, ask, describe");
  }

  const image = form.get("image") || form.get("file") || form.get("screenshot") || form.get("photo");
  if (!(image instanceof File)) {
    return jsonError("An image is required (multipart field: image).");
  }

  // Every alias the previous API accepted is still accepted, camelCase included,
  // so an existing iPhone Shortcut needs no edits.
  const question = formText(form, "question", "q", "ask", "text");
  const userNote = formText(
    form,
    "user_note",
    "userNote",
    "user_description",
    "userDescription",
    "note",
    "description",
    "text",
  );
  const source = formText(form, "source") || "iphone";
  const capturedAt = formText(form, "captured_at") || new Date().toISOString();
  const clientRequestId = formText(form, "client_request_id") || crypto.randomUUID();

  if (mode === "ask" && !question) {
    return jsonError("Ask needs a question (field: question or text).");
  }
  if (mode === "describe" && !userNote) {
    return jsonError("Describe needs a note (field: user_note, description, or text).");
  }

  // Idempotency is a unique constraint in the database, not an in-memory map that
  // dies with the lambda: a Shortcut that retries gets the original memory back.
  const existing = await getMemory(cfg.demoUserId, clientRequestId).catch(() => null);
  if (existing && existing.status === "ready") {
    const signed = existing.image_path
      ? (await signImageUrl([existing.image_path], cfg.signedUrlTtlSeconds)).get(existing.image_path)
      : null;
    return NextResponse.json({
      memory_id: existing.id,
      duplicate: true,
      status: existing.status,
      title: existing.title,
      content_type: existing.content_type,
      short_message: existing.analysis?.short_message || `Already saved: ${existing.title}`,
      answer: existing.answer,
      suggested_actions: existing.suggested_actions,
      image_url: signed ?? null,
      request_id: requestId,
    });
  }

  let validated;
  try {
    validated = await validateImage(image);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid image.");
  }

  const imagePath = makeImagePath(cfg.demoUserId, clientRequestId, validated.mime);

  // 1. Durable image first.
  try {
    await uploadScreenshot({ bytes: validated.bytes, mime: validated.mime, path: imagePath });
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "Could not store the screenshot.",
      502,
    );
  }

  // 2. Durable row second — the capture now survives any later failure.
  try {
    await createPendingMemory({
      userId: cfg.demoUserId,
      clientRequestId,
      source,
      captureMode: mode,
      capturedAt,
      imagePath,
      imageBytes: validated.size,
      imageMime: validated.mime,
      userNote,
      userQuestion: question,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not record the memory.", 502);
  }

  // 3. Understand it.
  const allowWebSearch = mode === "ask" && needsWebSearch(question);
  let analysis: ScreenshotAnalysis;
  let model = cfg.cursorModel;
  let toolsUsed: string[] = [];

  try {
    const result = await analyzeScreenshot({
      imageBytes: validated.bytes,
      mimeType: validated.mime,
      mode,
      question,
      userNote,
      source,
      capturedAt,
      allowWebSearch,
    });
    analysis = result.analysis;
    model = result.meta.model;
    toolsUsed = result.meta.toolsUsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    await failMemory({ userId: cfg.demoUserId, clientRequestId, error: message }).catch(() => {});
    console.error(`[capture] ${requestId} analysis failed: ${message}`);
    return NextResponse.json(
      {
        memory_id: clientRequestId,
        status: "failed",
        short_message:
          "Screenshot saved, but SnapAct could not read it. It will retry — nothing is lost.",
        error: message,
        retryable: err instanceof AgentError ? err.retryable : true,
        request_id: requestId,
      },
      { status: 502 },
    );
  }

  // 4. Persist the understanding, embedded and indexed.
  const searchText = buildSearchText({
    title: analysis.title,
    description: analysis.description,
    ocr_text: analysis.ocr_text,
    intent_summary: analysis.intent_summary,
    tags: analysis.tags,
    entities: analysis.entities,
    user_note: userNote,
    user_question: question,
    content_type: analysis.content_type,
    place: analysis.place,
    event: analysis.event,
    product: analysis.product,
    person: analysis.person,
  });

  let memory: Memory;
  try {
    memory = await completeMemory({
      userId: cfg.demoUserId,
      clientRequestId,
      patch: analysisToRow(analysis),
      searchText,
      model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    await failMemory({ userId: cfg.demoUserId, clientRequestId, error: message }).catch(() => {});
    return jsonError(`Screenshot understood, but saving failed: ${message}`, 502);
  }

  // 5. For Ask, optionally widen with what is already saved.
  let answer = analysis.answer;
  let shortMessage = analysis.short_message;
  const related: Array<Record<string, unknown>> = [];

  if (mode === "ask" && question && wantsMemoryContext(question)) {
    try {
      const found = await retrieve({
        userId: cfg.demoUserId,
        question,
        limit: 5,
        usePlanner: true,
      });
      // Never let the screenshot the user just asked about count as a memory of its own.
      const others = found.memories.filter((m) => m.id !== memory.id);
      if (others.length) {
        related.push(...toAnswerContext(others));
        const synthesized = await synthesizeAnswer({
          question,
          memories: [
            { id: memory.id, title: analysis.title, description: analysis.description, from: "the screenshot just captured" },
            ...toAnswerContext(others),
          ],
        });
        answer = synthesized.answer;
        shortMessage = synthesized.short_message;
      }
    } catch (err) {
      console.warn(`[capture] ${requestId} memory context failed`, err);
    }
  }

  const signed = (await signImageUrl([imagePath], cfg.signedUrlTtlSeconds)).get(imagePath) ?? null;

  console.info(
    `[capture] ${requestId} ok mode=${mode} type=${analysis.content_type} ${Date.now() - started}ms`,
  );

  return NextResponse.json({
    memory_id: memory.id,
    status: memory.status,
    duplicate: false,
    title: analysis.title,
    content_type: analysis.content_type,
    intent_mode: analysis.intent_mode,
    description: analysis.description,
    short_message: shortMessage,
    answer,
    tags: analysis.tags,
    suggested_actions: analysis.suggested_actions,
    citations: analysis.citations,
    due_on: analysis.due_on,
    event_on: analysis.event_on,
    confidence: analysis.confidence,
    related_memories: related,
    image_url: signed,
    agent_activity: analysis.agent_activity,
    model,
    tools_used: toolsUsed,
    duration_ms: Date.now() - started,
    request_id: requestId,
  });
}
