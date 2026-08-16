import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { findStalledMemories } from "@/lib/db/memories";
import { reanalyzeStored } from "@/lib/enrich";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Re-run analysis for captures whose background enrichment did not finish.
 *
 * Rows carry their failure reason and an attempt counter, so this is safe to call
 * repeatedly. It runs from three places: the Home retry button, an opportunistic
 * sweep on ordinary read traffic (lib/enrich.ts), and a daily Vercel cron.
 */
export async function POST(req: Request) {
  const cfg = getConfig();
  const body = await req.json().catch(() => ({}));
  const max = Math.min(Number(body.limit || 5), 25);

  try {
    const stalled = (await findStalledMemories(cfg.demoUserId)).slice(0, max);
    if (!stalled.length) {
      return NextResponse.json({ repaired: 0, failed: 0, remaining: 0, results: [] });
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const memory of stalled) {
      const result = await reanalyzeStored(memory);
      results.push({ id: memory.id, ok: result.ok, error: result.error });
    }

    const remaining = (await findStalledMemories(cfg.demoUserId)).length;
    return NextResponse.json({
      repaired: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      remaining,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Repair failed" },
      { status: 502 },
    );
  }
}

/** Status by default; Vercel's scheduled invocation (GET) also does the work. */
export async function GET(req: Request) {
  const cfg = getConfig();
  const isCron = (req.headers.get("user-agent") || "").includes("vercel-cron");

  try {
    const stalled = await findStalledMemories(cfg.demoUserId);

    if (isCron && stalled.length) {
      const results = [];
      for (const memory of stalled.slice(0, 10)) {
        results.push(await reanalyzeStored(memory));
      }
      return NextResponse.json({
        swept: results.length,
        repaired: results.filter((r) => r.ok).length,
      });
    }

    return NextResponse.json({
      stalled: stalled.length,
      memories: stalled.map((m) => ({
        id: m.id,
        status: m.status,
        attempts: m.analysis_attempts,
        error: m.analysis_error,
        created_at: m.created_at,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lookup failed" },
      { status: 502 },
    );
  }
}
