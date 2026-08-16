/**
 * The capture pipeline.
 *
 * Ordering is the whole design. The image is stored and a row is written before
 * anything slow happens, so a capture is durable within ~1s and can never be
 * lost. What runs after that depends on the mode:
 *
 *   save / describe — return immediately; full analysis runs in the background.
 *   ask             — run one small vision call (~5s) so the user gets their
 *                     answer, then enrich the metadata in the background.
 *
 * Deferring analysis is what the original pipeline did too, and it left 77% of
 * rows unanalyzed. The difference is bookkeeping: every outcome is written to the
 * row, failures are retried, and `sweepStalled` catches anything left over. See
 * lib/enrich.ts.
 */

import { after, NextResponse } from "next/server";
import { AgentError, answerAboutImage } from "@/lib/agent";
import { getConfig } from "@/lib/config";
import { createPendingMemory, getMemory } from "@/lib/db/memories";
import { makeImagePath, signImageUrl, uploadScreenshot } from "@/lib/db/storage";
import { enrichMemory } from "@/lib/enrich";
import { validateImage } from "@/lib/image";
import type { CaptureMode } from "@/lib/schemas/memory";

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

  const mode = (forcedMode || (formText(form, "mode") || "save").toLowerCase()) as CaptureMode;
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

  // 1. Durable image.
  try {
    await uploadScreenshot({ bytes: validated.bytes, mime: validated.mime, path: imagePath });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not store the screenshot.", 502);
  }

  // 2. Durable row. The capture now survives any later failure.
  let memory;
  try {
    memory = await createPendingMemory({
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

  const scheduleEnrichment = (keepAnswer?: string | null) => {
    after(async () => {
      await enrichMemory({
        userId: cfg.demoUserId,
        clientRequestId,
        imageBytes: validated.bytes,
        mimeType: validated.mime,
        mode,
        question,
        userNote,
        source,
        capturedAt,
        keepAnswer,
      });
    });
  };

  /* ------------------------------------------------- ask: answer now, enrich later */

  if (mode === "ask" && question) {
    try {
      const result = await answerAboutImage({
        imageBytes: validated.bytes,
        mimeType: validated.mime,
        question,
        capturedAt,
      });
      scheduleEnrichment(result.answer);

      const signed = (await signImageUrl([imagePath], cfg.signedUrlTtlSeconds)).get(imagePath);
      console.info(`[capture] ${requestId} ask ${Date.now() - started}ms`);

      return NextResponse.json({
        memory_id: memory.id,
        status: "pending",
        duplicate: false,
        title: result.title,
        answer: result.answer,
        short_message: result.short_message,
        image_url: signed ?? null,
        agent_activity: ["Screenshot read", "Answered", "Organizing in the background"],
        model: result.meta.model,
        tools_used: result.meta.toolsUsed,
        duration_ms: Date.now() - started,
        request_id: requestId,
      });
    } catch (err) {
      // Answering failed, but the screenshot is safely stored — still enrich it.
      scheduleEnrichment(null);
      const message = err instanceof Error ? err.message : "Could not read the screenshot";
      return NextResponse.json(
        {
          memory_id: memory.id,
          status: "pending",
          short_message: "Saved, but SnapAct could not answer that just now.",
          error: message,
          detail: message,
          retryable: err instanceof AgentError ? err.retryable : true,
          request_id: requestId,
        },
        { status: 502 },
      );
    }
  }

  /* ------------------------------------------- save / describe: return immediately */

  scheduleEnrichment(null);

  const signed = (await signImageUrl([imagePath], cfg.signedUrlTtlSeconds)).get(imagePath);
  console.info(`[capture] ${requestId} ${mode} ${Date.now() - started}ms (analysis deferred)`);

  return NextResponse.json({
    memory_id: memory.id,
    status: "pending",
    duplicate: false,
    title: userNote || "Screenshot",
    short_message: userNote ? `Saved ✓ ${userNote}`.slice(0, 200) : "Saved to SnapAct ✓",
    answer: null,
    suggested_actions: [],
    citations: [],
    image_url: signed ?? null,
    agent_activity: ["Screenshot saved", "Organizing in the background"],
    model: cfg.cursorModel,
    tools_used: [],
    duration_ms: Date.now() - started,
    request_id: requestId,
  });
}
