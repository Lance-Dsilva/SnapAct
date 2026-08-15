import { after, NextResponse } from "next/server";
import { analyzeScreenshot, SnapActAgentError } from "@/lib/agents/snapact-agent";
import { getConfig } from "@/lib/config";
import { getIdempotent, setIdempotent } from "@/lib/idempotency";
import { validateImageFile } from "@/lib/image";
import { getMemoryStore } from "@/lib/memory/memory-store";
import type { CaptureMode, MemoryAnalysis } from "@/lib/schemas/memory";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ detail: message }, { status });
}

function formText(form: FormData, ...keys: string[]) {
  for (const key of keys) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function handleCapture(req: Request, forcedMode?: CaptureMode) {
  const requestId = crypto.randomUUID().slice(0, 12);
  const started = Date.now();

  try {
    const form = await req.formData();
    const image = form.get("image") || form.get("file") || form.get("screenshot");
    const mode = (forcedMode || String(form.get("mode") || "save").toLowerCase()) as CaptureMode;
    const question =
      mode === "ask"
        ? formText(form, "question", "q", "ask", "text")
        : formText(form, "question", "q");
    const userDescription =
      mode === "describe"
        ? formText(form, "user_description", "userDescription", "description", "note", "text")
        : formText(form, "user_description", "userDescription", "description", "note");
    const source = formText(form, "source") || "iphone";
    const capturedAt = formText(form, "captured_at");
    const clientRequestId = formText(form, "client_request_id");

    console.info(
      `[capture] request_id=${requestId} mode=${mode} source=${source} client_request_id=${clientRequestId || "-"}`,
    );

    if (!["save", "ask", "describe"].includes(mode)) {
      return jsonError("mode must be save | ask | describe");
    }
    if (mode === "ask" && !question) {
      return jsonError("question is required for Ask (form field: question or text)");
    }
    if (mode === "describe" && !userDescription) {
      return jsonError("description is required for Describe (form field: user_description, description, or text)");
    }
    if (!(image instanceof File)) {
      return jsonError("image is required (multipart file field: image)");
    }

    const cached = getIdempotent(clientRequestId);
    if (cached) {
      return NextResponse.json({ ...(cached as object), duplicate: true });
    }

    const { bytes, contentType } = await validateImageFile(image);
    const cfg = getConfig();
    const store = getMemoryStore();
    const saveId = clientRequestId || crypto.randomUUID();

    if (mode === "save") {
      const pendingAnalysis: MemoryAnalysis = {
        title: "Saved screenshot",
        content_type: "other",
        intent_mode: "REMEMBER",
        intent_summary: "Screenshot captured from iPhone; Grok is still analyzing.",
        description: "Screenshot saved. Analysis is running in the background.",
        searchable_text: "saved screenshot iphone capture pending analysis",
        tags: ["pending"],
        entities: [],
        actionable: false,
        urgency: "none",
        needs_live_search: false,
        confidence: 0.2,
        suggested_actions: [],
        citations: [],
        agent_activity: ["Screenshot received", "Saved immediately", "Grok analyzing in background"],
        short_message: "Saved to SnapAct ✓",
      };
      let saved: { memory_id: string; image_url: string | null; created_at: string };
      try {
        saved = await store.saveMemory({
          userId: cfg.demoUserId,
          imageBytes: bytes,
          contentType,
          metadata: {
            title: pendingAnalysis.title,
            content_type: pendingAnalysis.content_type,
            source,
            captured_at: capturedAt,
            analysis: pendingAnalysis,
            mode,
            pending: true,
          },
          searchableText: pendingAnalysis.searchable_text,
          clientRequestId: saveId,
        });
      } catch (err) {
        return jsonError(
          err instanceof Error ? `Could not save screenshot: ${err.message}` : "Could not save screenshot.",
          502,
        );
      }

      const imageBytes = Buffer.from(bytes);
      after(async () => {
        try {
          const result = await analyzeScreenshot({
            imageBytes,
            mimeType: contentType,
            mode: "save",
            question,
            userDescription,
            source,
            capturedAt,
          });
          const analysis = result.analysis;
          analysis.agent_activity = [...(analysis.agent_activity || []), "Background analysis saved"];
          await store.saveMemory({
            userId: cfg.demoUserId,
            imageBytes,
            contentType,
            metadata: {
              title: analysis.title,
              content_type: analysis.content_type,
              intent_mode: analysis.intent_mode,
              intent_summary: analysis.intent_summary,
              description: analysis.description,
              tags: analysis.tags,
              event: analysis.event,
              person_followup: analysis.person_followup,
              place: analysis.place,
              captured_at: capturedAt,
              source,
              analysis,
              mode: "save",
              pending: false,
            },
            searchableText: analysis.searchable_text,
            clientRequestId: saveId,
            skipUpload: true,
          });
          console.info(`[capture] background done request_id=${requestId} memory_id=${saved.memory_id}`);
        } catch (err) {
          console.error(`[capture] background failed request_id=${requestId}`, err);
        }
      });

      const response = {
        memory_id: saved.memory_id,
        short_message: "Saved to SnapAct ✓",
        answer: null,
        analysis: pendingAnalysis,
        suggested_actions: [],
        citations: [],
        image_url: saved.image_url,
        agent_activity: pendingAnalysis.agent_activity,
        duplicate: false,
        degraded: false,
        warning: null,
        pending: true,
        model: cfg.cursorModel || "pending",
        tools_used: [],
        duration_ms: Date.now() - started,
        request_id: requestId,
      };
      setIdempotent(saveId, response);
      return NextResponse.json(response);
    }

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
