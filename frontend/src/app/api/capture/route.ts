import { NextResponse } from "next/server";
import { analyzeScreenshot, SnapActAgentError } from "@/lib/agents/snapact-agent";
import { getConfig } from "@/lib/config";
import { getIdempotent, setIdempotent } from "@/lib/idempotency";
import { validateImageFile } from "@/lib/image";
import { getMemoryStore } from "@/lib/memory/memory-store";
import type { CaptureMode, MemoryAnalysis } from "@/lib/schemas/memory";

export const runtime = "nodejs";
export const maxDuration = 300;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ detail: message }, { status });
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID().slice(0, 12);
  const started = Date.now();

  try {
    const form = await req.formData();
    const image = form.get("image");
    const modeRaw = String(form.get("mode") || "save").toLowerCase();
    const mode = modeRaw as CaptureMode;
    const question = (form.get("question") as string | null) || null;
    const userDescription =
      (form.get("user_description") as string | null) ||
      (form.get("userDescription") as string | null) ||
      null;
    const source = (form.get("source") as string | null) || "web";
    const capturedAt = (form.get("captured_at") as string | null) || null;
    const clientRequestId = (form.get("client_request_id") as string | null) || null;

    console.info(
      `[capture] request_id=${requestId} mode=${mode} source=${source} client_request_id=${clientRequestId || "-"}`,
    );

    if (!["save", "ask", "describe"].includes(mode)) {
      return jsonError("mode must be save | ask | describe");
    }
    if (mode === "ask" && !question?.trim()) {
      return jsonError("question is required when mode=ask");
    }
    if (mode === "describe" && !userDescription?.trim()) {
      return jsonError("user_description is required when mode=describe");
    }
    if (!(image instanceof File)) {
      return jsonError("image is required (multipart file)");
    }

    const cached = getIdempotent(clientRequestId);
    if (cached) {
      return NextResponse.json({ ...(cached as object), duplicate: true });
    }

    const { bytes, contentType } = await validateImageFile(image);
    const cfg = getConfig();
    const store = getMemoryStore();

    let analysis: MemoryAnalysis;
    let degraded = false;
    let warning: string | null = null;
    let modelUsed = cfg.cursorModel || "mock";
    let toolsUsed: string[] = [];

    try {
      const result = await analyzeScreenshot({
        imageBytes: bytes,
        mimeType: contentType,
        mode,
        question,
        userDescription,
        source,
        capturedAt,
      });
      analysis = result.analysis;
      modelUsed = result.meta.model;
      toolsUsed = result.meta.toolsUsed;
      if (analysis.live_verification_failed) {
        degraded = true;
        warning =
          "Screenshot understood and saved. Live verification is temporarily unavailable.";
      }
    } catch (err) {
      const fallback = (err as { fallbackAnalysis?: MemoryAnalysis }).fallbackAnalysis;
      if (fallback) {
        analysis = fallback;
        degraded = true;
        warning =
          err instanceof Error
            ? err.message
            : "Grok analysis unavailable; saved with limited metadata.";
      } else if (err instanceof SnapActAgentError) {
        return jsonError(err.message, 502);
      } else {
        throw err;
      }
    }

    // All modes must save.
    analysis.agent_activity = [...(analysis.agent_activity || []), "Memory saved"];

    const metadata = {
      title: analysis.title,
      content_type: analysis.content_type,
      intent_mode: analysis.intent_mode,
      intent_summary: analysis.intent_summary,
      description: analysis.description,
      tags: analysis.tags,
      entities: analysis.entities,
      actionable: analysis.actionable,
      urgency: analysis.urgency,
      captured_at: capturedAt,
      source,
      confidence: analysis.confidence,
      event: analysis.event,
      person_followup: analysis.person_followup,
      place: analysis.place,
      product: analysis.product,
      temporal: analysis.temporal,
      question,
      user_description: userDescription,
      answer: analysis.answer,
      citations: analysis.citations,
      suggested_actions: analysis.suggested_actions,
      analysis,
      agent_activity: analysis.agent_activity,
      mode,
    };

    let saved: { memory_id: string; image_url: string | null; created_at: string; duplicate?: boolean };
    try {
      saved = await store.saveMemory({
        userId: cfg.demoUserId,
        imageBytes: bytes,
        contentType,
        metadata,
        searchableText: analysis.searchable_text,
        clientRequestId,
      });
    } catch (err) {
      console.error(`[capture] memory_save_failed request_id=${requestId}`);
      return NextResponse.json(
        {
          detail:
            err instanceof Error
              ? `Screenshot understood, but saving failed: ${err.message}`
              : "Screenshot understood, but saving failed.",
          analysis,
          short_message: "Understood, but could not save to memory yet.",
        },
        { status: 502 },
      );
    }

    const shortMessage =
      mode === "save"
        ? analysis.short_message?.startsWith("Saved to SnapAct")
          ? analysis.short_message
          : `Saved to SnapAct ✓ ${analysis.title}`
        : analysis.short_message || analysis.answer || `Saved: ${analysis.title}`;

    const response = {
      memory_id: saved.memory_id,
      short_message: shortMessage,
      answer: analysis.answer,
      analysis,
      suggested_actions: analysis.suggested_actions,
      citations: analysis.citations,
      image_url: saved.image_url,
      agent_activity: analysis.agent_activity,
      duplicate: Boolean(saved.duplicate),
      degraded,
      warning,
      model: modelUsed,
      tools_used: toolsUsed,
      duration_ms: Date.now() - started,
      request_id: requestId,
    };

    setIdempotent(clientRequestId, response);
    console.info(
      `[capture] done request_id=${requestId} memory_id=${saved.memory_id} model=${modelUsed} duration_ms=${response.duration_ms} tools=${toolsUsed.join(",") || "none"}`,
    );
    return NextResponse.json(response);
  } catch (err) {
    console.error(`[capture] failed request_id=${requestId}`, err);
    return jsonError(err instanceof Error ? err.message : "Capture failed", 500);
  }
}
