import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getMemoryStore } from "@/lib/memory/memory-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = String(body.query || "").trim();
    const topK = Number(body.top_k || body.topK || 8);
    if (!query) {
      return NextResponse.json({ detail: "query is required" }, { status: 400 });
    }

    const cfg = getConfig();
    const store = getMemoryStore();
    const hits = await store.searchMemories({
      userId: cfg.demoUserId,
      query,
      topK,
      filters: body.filters || {},
    });

    const results = hits.map((hit) => {
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

    return NextResponse.json({ query, results });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Search failed" },
      { status: 502 },
    );
  }
}
