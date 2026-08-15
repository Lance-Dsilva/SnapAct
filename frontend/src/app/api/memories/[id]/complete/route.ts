import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getMemoryStore } from "@/lib/memory/memory-store";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({ completed: true }));
    const cfg = getConfig();
    const store = getMemoryStore();
    const mem = await store.updateMemory({
      userId: cfg.demoUserId,
      memoryId: id,
      patch: { completed: body.completed !== false },
    });
    if (!mem) return NextResponse.json({ detail: "Memory not found." }, { status: 404 });
    return NextResponse.json({
      memory_id: mem.memory_id,
      completed: mem.completed,
      title: mem.analysis?.title || mem.metadata.title,
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Update failed" },
      { status: 502 },
    );
  }
}
