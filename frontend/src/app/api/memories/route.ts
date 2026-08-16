import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getMemoryStore } from "@/lib/memory/memory-store";
import type { MemoryRecord } from "@/lib/schemas/memory";

export const runtime = "nodejs";
export const maxDuration = 60;

function serialize(mem: MemoryRecord) {
  return {
    memory_id: mem.memory_id,
    user_id: mem.user_id,
    image_url: mem.image_url,
    created_at: mem.created_at,
    updated_at: mem.updated_at,
    searchable_text: mem.searchable_text,
    metadata: mem.metadata,
    analysis: mem.analysis,
    source: mem.source,
    captured_at: mem.captured_at,
    question: mem.question,
    user_description: mem.user_description,
    completed: mem.completed,
    demo_seed: Boolean(mem.metadata.demo_seed),
    title: mem.analysis?.title || mem.metadata.title || mem.memory_id,
    content_type: mem.analysis?.content_type || mem.metadata.content_type || "other",
    intent_mode: mem.analysis?.intent_mode || mem.metadata.intent_mode || "REMEMBER",
    description: mem.analysis?.description || mem.metadata.description || "",
    tags: mem.analysis?.tags || mem.metadata.tags || [],
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit") || 40);
    const contentType = searchParams.get("content_type");
    const cfg = getConfig();
    const store = getMemoryStore();
    const memories = await store.listRecent({
      userId: cfg.demoUserId,
      limit,
      filters: contentType ? { content_type: contentType } : {},
    });
    return NextResponse.json({
      memories: memories.map(serialize),
      source: store.usingRemote ? "api" : "mock",
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "List failed" },
      { status: 502 },
    );
  }
}
