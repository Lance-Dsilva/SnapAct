import { NextResponse } from "next/server";
import { analyzeScreenshot } from "@/lib/agent";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/supabase";
import {
  buildSearchText,
  completeMemory,
  failMemory,
  findStalledMemories,
} from "@/lib/db/memories";
import type { Memory, ScreenshotAnalysis } from "@/lib/schemas/memory";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    citations: analysis.citations,
    confidence: analysis.confidence,
    analysis,
  };
}

/**
 * Re-run analysis for memories whose first attempt failed.
 *
 * This is the safety net the old pipeline lacked: it fired analysis into a Vercel
 * `after()` callback, and when that never ran the row sat at "pending analysis"
 * forever with nothing to retry it. Rows here carry their failure reason and an
 * attempt counter, so this is safe to call repeatedly (and from a cron).
 */
export async function POST(req: Request) {
  const cfg = getConfig();
  const body = await req.json().catch(() => ({}));
  const max = Math.min(Number(body.limit || 5), 25);

  try {
    const stalled = (await findStalledMemories(cfg.demoUserId)).slice(0, max);
    if (!stalled.length) {
      return NextResponse.json({ repaired: 0, failed: 0, remaining: 0, results: [] });
    }

    const results: Array<{ id: string; ok: boolean; title?: string; error?: string }> = [];

    for (const memory of stalled) {
      if (!memory.image_path) {
        await failMemory({
          userId: cfg.demoUserId,
          clientRequestId: memory.client_request_id,
          error: "No stored image to analyze",
        });
        results.push({ id: memory.id, ok: false, error: "No stored image" });
        continue;
      }

      try {
        const { data, error } = await db()
          .storage.from(cfg.supabaseBucket)
          .download(memory.image_path);
        if (error || !data) throw new Error(error?.message || "Image download failed");

        const bytes = Buffer.from(await data.arrayBuffer());
        const { analysis, meta } = await analyzeScreenshot({
          imageBytes: bytes,
          mimeType: memory.image_mime || "image/png",
          mode: (memory.capture_mode as "save" | "ask" | "describe") || "save",
          question: memory.user_question,
          userNote: memory.user_note,
          source: memory.source,
          capturedAt: memory.captured_at || memory.created_at,
        });

        await completeMemory({
          userId: cfg.demoUserId,
          clientRequestId: memory.client_request_id,
          patch: analysisToRow(analysis),
          searchText: buildSearchText({
            title: analysis.title,
            description: analysis.description,
            ocr_text: analysis.ocr_text,
            intent_summary: analysis.intent_summary,
            tags: analysis.tags,
            entities: analysis.entities,
            user_note: memory.user_note,
            user_question: memory.user_question,
            content_type: analysis.content_type,
            place: analysis.place,
            event: analysis.event,
            product: analysis.product,
            person: analysis.person,
          }),
          model: meta.model,
        });

        results.push({ id: memory.id, ok: true, title: analysis.title });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Repair failed";
        await failMemory({
          userId: cfg.demoUserId,
          clientRequestId: memory.client_request_id,
          error: message,
        });
        results.push({ id: memory.id, ok: false, error: message });
      }
    }

    const remaining = (await findStalledMemories(cfg.demoUserId)).length;
    return NextResponse.json({
      repaired: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      remaining,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Repair failed" },
      { status: 502 },
    );
  }
}

export async function GET() {
  const cfg = getConfig();
  try {
    const stalled = await findStalledMemories(cfg.demoUserId);
    return NextResponse.json({
      stalled: stalled.length,
      memories: stalled.map((m) => ({
        id: m.id,
        status: m.status,
        attempts: m.analysis_attempts,
        error: m.analysis_error,
        created_at: m.created_at,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}
