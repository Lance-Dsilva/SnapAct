import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { deleteMemory, getMemory, updateMemory, withImageUrls } from "@/lib/db/memories";
import { deleteScreenshot } from "@/lib/db/storage";
import { serializeMemory } from "@/lib/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const cfg = getConfig();
    const memory = await getMemory(cfg.demoUserId, id);
    if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    const [withUrl] = await withImageUrls([memory]);
    return NextResponse.json(serializeMemory(withUrl), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const cfg = getConfig();
    const body = await req.json().catch(() => ({}));

    // Only user-editable fields; model-owned columns stay under the pipeline's control.
    const patch: Record<string, unknown> = {};
    if (typeof body.completed === "boolean") {
      patch.completed_at = body.completed ? new Date().toISOString() : null;
    }
    if (typeof body.title === "string" && body.title.trim()) {
      patch.title = body.title.trim().slice(0, 120);
    }
    if (typeof body.user_note === "string") patch.user_note = body.user_note.slice(0, 2000);
    if (Array.isArray(body.tags)) {
      patch.tags = body.tags.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 12);
    }
    if (typeof body.due_on === "string" || body.due_on === null) patch.due_on = body.due_on;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
    }

    const updated = await updateMemory(cfg.demoUserId, id, patch);
    if (!updated) return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    const [withUrl] = await withImageUrls([updated]);
    return NextResponse.json(serializeMemory(withUrl));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 502 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const cfg = getConfig();
    const memory = await getMemory(cfg.demoUserId, id);
    if (!memory) return NextResponse.json({ error: "Memory not found" }, { status: 404 });

    const removed = await deleteMemory(cfg.demoUserId, memory.id);
    if (memory.image_path) await deleteScreenshot(memory.image_path).catch(() => {});
    return NextResponse.json({ deleted: removed, id: memory.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 502 },
    );
  }
}
