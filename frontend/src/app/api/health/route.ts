import { NextResponse } from "next/server";
import { cursorConfigured, getConfig } from "@/lib/config";
import { db } from "@/lib/db/supabase";
import { embed } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Checks each dependency for real rather than reporting a static "ok". */
export async function GET() {
  const cfg = getConfig();
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    const { error, count } = await db()
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", cfg.demoUserId);
    checks.database = error
      ? { ok: false, detail: error.message }
      : { ok: true, detail: `${count ?? 0} memories` };
  } catch (err) {
    checks.database = { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
  }

  try {
    const vector = await embed("health check");
    checks.embeddings = vector
      ? { ok: true, detail: `gte-small, ${vector.length}d` }
      : { ok: false, detail: "no vector returned" };
  } catch (err) {
    checks.embeddings = { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
  }

  try {
    const { error } = await db().storage.from(cfg.supabaseBucket).list("", { limit: 1 });
    checks.storage = error ? { ok: false, detail: error.message } : { ok: true };
  } catch (err) {
    checks.storage = { ok: false, detail: err instanceof Error ? err.message : "unreachable" };
  }

  checks.model = cursorConfigured()
    ? { ok: true, detail: cfg.cursorModel }
    : { ok: false, detail: "CURSOR_MODEL not configured" };

  const healthy = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
