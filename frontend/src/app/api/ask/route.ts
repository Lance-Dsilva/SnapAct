import { NextResponse } from "next/server";
import { analyzeSavedMemories } from "@/lib/agents/snapact-agent";
import { getConfig } from "@/lib/config";
import { getMemoryStore } from "@/lib/memory/memory-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question || "").trim();
    const topK = Number(body.top_k || 8);
    if (!question) {
      return NextResponse.json({ detail: "question is required" }, { status: 400 });
    }

    const cfg = getConfig();
    const store = getMemoryStore();
    const hits = await store.searchMemories({
      userId: cfg.demoUserId,
      query: question,
      topK,
    });

    const memories = hits.map((hit) => {
      const meta = hit.metadata || {};
      const analysis = hit.analysis;
      return {
        memory_id: hit.memory_id,
        title: analysis?.title || meta.title || hit.memory_id,
        description: analysis?.description || meta.description || "",
        image_url: hit.image_url,
        content_type: analysis?.content_type || meta.content_type || "other",
        intent_mode: analysis?.intent_mode || meta.intent_mode || "REMEMBER",
        score: hit.score,
        tags: analysis?.tags || meta.tags || [],
        metadata: meta,
      };
    });

    let synthesized: {
      answer: string;
      short_message: string;
      citations: unknown[];
      agent_activity: string[];
    };
    try {
      synthesized = await analyzeSavedMemories({
        question,
        memories: memories.map((m) => ({
          memory_id: m.memory_id,
          title: m.title,
          description: m.description,
          content_type: m.content_type,
          intent_mode: m.intent_mode,
          tags: m.tags,
          score: m.score,
        })),
      });
    } catch (err) {
      console.warn("[ask] grok synthesis failed; returning search hits", err);
      const titles = memories.map((m) => m.title).filter(Boolean).slice(0, 5);
      const answer = titles.length
        ? `I found ${memories.length} related screenshot(s): ${titles.join("; ")}.`
        : `I could not find matching screenshots for “${question}”.`;
      synthesized = {
        answer,
        short_message: answer,
        citations: [],
        agent_activity: ["Retrieved memories", "Model unavailable; listed search results"],
      };
    }

    return NextResponse.json({
      answer: synthesized.answer,
      short_message: synthesized.short_message,
      memories,
      citations: synthesized.citations,
      agent_activity: synthesized.agent_activity,
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Ask failed" },
      { status: 502 },
    );
  }
}
