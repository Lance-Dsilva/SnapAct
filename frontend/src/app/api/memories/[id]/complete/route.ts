import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getMemory, updateMemory } from "@/lib/db/memories";
import { serializeMemory } from "@/lib/serialize";

export const runtime = "nodejs";

/** Mark an actionable memory done (or undo it). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cfg = getConfig();
    const body = await req.json().catch(() => ({}));
    const completed = body.completed !== false;

    const existing = await getMemory(cfg.demoUserId, id);
    if (!existing) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

    const updated = await updateMemory(cfg.demoUserId, existing.id, {
      completed_at: completed ? new Date().toISOString() : null,
    });
    return NextResponse.json(serializeMemory(updated!));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 502 },
    );
  }
}
