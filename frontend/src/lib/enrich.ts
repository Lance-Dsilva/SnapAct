/**
 * Background analysis.
 *
 * Captures return as soon as the image and row are durable; the expensive vision
 * pass (~20s for the full metadata schema) runs here afterwards.
 *
 * The original pipeline also deferred analysis, and it left 77% of rows without
 * any — because it was fire-and-forget: no failure was recorded, nothing retried,
 * and a stalled row was indistinguishable from a healthy one. The difference here
 * is that every outcome is written to the row (`status`, `analysis_error`,
 * `analysis_attempts`), a failure is retried once inline, and `sweepStalled`
 * picks up anything still outstanding on later requests.
 */

import { analyzeScreenshot } from "@/lib/agent";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/supabase";
import {
  buildSearchText,
  completeMemory,
  failMemory,
  findStalledMemories,
} from "@/lib/db/memories";
import { forVisionModel } from "@/lib/images";
import type { Memory, ScreenshotAnalysis } from "@/lib/schemas/memory";

export function analysisToRow(analysis: ScreenshotAnalysis): Partial<Memory> {
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
    citations: analysis.citations,
    confidence: analysis.confidence,
    analysis,
  };
}

export function searchTextFor(
  analysis: ScreenshotAnalysis,
  extras: { userNote?: string | null; userQuestion?: string | null },
) {
  return buildSearchText({
    title: analysis.title,
    description: analysis.description,
    ocr_text: analysis.ocr_text,
    intent_summary: analysis.intent_summary,
    tags: analysis.tags,
    entities: analysis.entities,
    user_note: extras.userNote,
    user_question: extras.userQuestion,
    content_type: analysis.content_type,
    place: analysis.place,
    event: analysis.event,
    product: analysis.product,
    person: analysis.person,
  });
}

/**
 * Cap concurrent vision calls.
 *
 * Firing them in parallel does not finish sooner — it makes every call slower.
 * Measured: six concurrent analyses averaged 80s each, against 22s run one at a
 * time. Saving a burst of screenshots would otherwise degrade into a stampede
 * that also slows down whatever the user asks next.
 */
const MAX_CONCURRENT_ANALYSES = 2;
let running = 0;
const waiting: Array<() => void> = [];

async function acquireSlot() {
  if (running < MAX_CONCURRENT_ANALYSES) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
}

function releaseSlot() {
  running -= 1;
  waiting.shift()?.();
}

/**
 * Analyze one capture and complete its row. Retries once on a retryable failure,
 * then records the error so the row stays visible and repairable.
 */
export async function enrichMemory(input: {
  userId: string;
  clientRequestId: string;
  imageBytes: Buffer;
  mimeType: string;
  mode: "save" | "ask" | "describe";
  question?: string | null;
  userNote?: string | null;
  source?: string | null;
  capturedAt?: string | null;
  /** Preserve an answer already produced by the fast Ask path. */
  keepAnswer?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const small = await forVisionModel(input.imageBytes, input.mimeType);

  await acquireSlot();
  try {
    return await runAnalysis(input, small);
  } finally {
    releaseSlot();
  }
}

async function runAnalysis(
  input: Parameters<typeof enrichMemory>[0],
  small: { bytes: Buffer; mime: string },
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { analysis, meta } = await analyzeScreenshot({
        imageBytes: small.bytes,
        mimeType: small.mime,
        // The answer, if any, was produced up front; here we only want metadata.
        mode: input.mode === "ask" ? "save" : input.mode,
        question: input.question,
        userNote: input.userNote,
        source: input.source,
        capturedAt: input.capturedAt,
      });

      const patch = analysisToRow(analysis);
      if (input.keepAnswer) patch.answer = input.keepAnswer;

      await completeMemory({
        userId: input.userId,
        clientRequestId: input.clientRequestId,
        patch,
        searchText: searchTextFor(analysis, {
          userNote: input.userNote,
          userQuestion: input.question,
        }),
        model: meta.model,
      });

      console.info(`[enrich] ok ${input.clientRequestId} -> ${analysis.content_type}`);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      if (attempt === 2) {
        console.error(`[enrich] failed ${input.clientRequestId}: ${message}`);
        await failMemory({
          userId: input.userId,
          clientRequestId: input.clientRequestId,
          error: message,
        }).catch(() => {});
        return { ok: false, error: message };
      }
      console.warn(`[enrich] attempt ${attempt} failed, retrying: ${message}`);
    }
  }
  return { ok: false, error: "unreachable" };
}

/** Re-download a stored screenshot and analyze it again. */
export async function reanalyzeStored(memory: Memory): Promise<{ ok: boolean; error?: string }> {
  const cfg = getConfig();
  if (!memory.image_path) {
    await failMemory({
      userId: memory.user_id,
      clientRequestId: memory.client_request_id,
      error: "No stored image to analyze",
    });
    return { ok: false, error: "No stored image" };
  }

  const { data, error } = await db().storage.from(cfg.supabaseBucket).download(memory.image_path);
  if (error || !data) {
    const message = error?.message || "Image download failed";
    await failMemory({
      userId: memory.user_id,
      clientRequestId: memory.client_request_id,
      error: message,
    });
    return { ok: false, error: message };
  }

  return enrichMemory({
    userId: memory.user_id,
    clientRequestId: memory.client_request_id,
    imageBytes: Buffer.from(await data.arrayBuffer()),
    mimeType: memory.image_mime || "image/png",
    mode: (memory.capture_mode as "save" | "ask" | "describe") || "save",
    question: memory.user_question,
    userNote: memory.user_note,
    source: memory.source,
    capturedAt: memory.captured_at || memory.created_at,
    keepAnswer: memory.answer,
  });
}

let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Opportunistically repair stalled rows, triggered by ordinary read traffic.
 *
 * Vercel Hobby only allows a daily cron, which is far too slow to be the safety
 * net for a background queue. Piggybacking on requests the user is already making
 * means a stalled capture is normally picked up within a minute of the next page
 * load, with the daily cron as a backstop.
 */
export async function sweepStalled(userId: string, max = 3): Promise<number> {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return 0;
  lastSweep = now;

  const stalled = await findStalledMemories(userId).catch(() => []);
  const batch = stalled.slice(0, max);
  if (!batch.length) return 0;

  console.info(`[enrich] sweeping ${batch.length} stalled memories`);
  let repaired = 0;
  for (const memory of batch) {
    const result = await reanalyzeStored(memory);
    if (result.ok) repaired += 1;
  }
  return repaired;
}
