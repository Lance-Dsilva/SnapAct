import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getMemoryStore } from "@/lib/memory/memory-store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const cfg = getConfig();
    const store = getMemoryStore();
    const mem = await store.getMemory({ userId: cfg.demoUserId, memoryId: id });
    if (!mem) return NextResponse.json({ detail: "Memory not found." }, { status: 404 });
    return NextResponse.json({
      memory_id: mem.memory_id,
      title: mem.analysis?.title || mem.metadata.title || mem.memory_id,
      description: mem.analysis?.description || mem.metadata.description || "",
      content_type: mem.analysis?.content_type || mem.metadata.content_type || "other",
      intent_mode: mem.analysis?.intent_mode || mem.metadata.intent_mode || "REMEMBER",
      image_url: mem.image_url,
      tags: mem.analysis?.tags || mem.metadata.tags || [],
      analysis: mem.analysis,
      metadata: mem.metadata,
      question: mem.question,
      user_description: mem.user_description,
      completed: mem.completed,
      demo_seed: Boolean(mem.metadata.demo_seed),
      created_at: mem.created_at,
      source: mem.source,
      captured_at: mem.captured_at,
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Get failed" },
      { status: 502 },
    );
  }
}
