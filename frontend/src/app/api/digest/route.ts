import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { countMemories, listMemories, typeCounts, withImageUrls } from "@/lib/db/memories";
import { serializeMemory } from "@/lib/serialize";
import type { Memory } from "@/lib/schemas/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The organized view of everything saved.
 *
 * Deterministic on purpose. The old Home asked a model to sort memories into
 * buckets on every load — slow, non-reproducible, and prone to dropping items it
 * simply forgot to mention. Bucketing is a property of the data (dates, urgency,
 * completion), so it is computed here from indexed columns and is always correct.
 */
export async function GET() {
  const cfg = getConfig();

  try {
    const today = new Date();
    const todayYmd = today.toISOString().slice(0, 10);
    const inTwoWeeks = new Date(today.getTime() + 14 * 86400_000).toISOString().slice(0, 10);

    const [everything, total, counts] = await Promise.all([
      listMemories({ userId: cfg.demoUserId, limit: 200 }),
      countMemories(cfg.demoUserId),
      typeCounts(cfg.demoUserId),
    ]);

    const open = (m: Memory) => !m.completed_at;

    // Overdue or due within a week, soonest first.
    const dueSoon = everything
      .filter((m) => open(m) && m.due_on && m.due_on <= inTwoWeeks)
      .sort((a, b) => (a.due_on! < b.due_on! ? -1 : 1));

    // Events still ahead of us, soonest first.
    const upcoming = everything
      .filter((m) => m.event_on && m.event_on >= todayYmd)
      .sort((a, b) => (a.event_on! < b.event_on! ? -1 : 1));

    const dueOrUpcoming = new Set([...dueSoon, ...upcoming].map((m) => m.id));

    // Actionable, urgent, and not already surfaced by a date above.
    const needsAttention = everything
      .filter(
        (m) =>
          open(m) &&
          m.actionable &&
          (m.urgency === "high" || m.urgency === "medium" || m.intent_mode === "ACT") &&
          !dueOrUpcoming.has(m.id),
      )
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2, none: 3 } as const;
        return rank[a.urgency] - rank[b.urgency];
      })
      .slice(0, 12);

    const exploring = everything
      .filter((m) => m.intent_mode === "EXPLORE" && open(m))
      .slice(0, 12);

    const decorate = async (items: Memory[]) =>
      (await withImageUrls(items)).map(serializeMemory);

    const [attention, events, due, explore, recent] = await Promise.all([
      decorate(needsAttention),
      decorate(upcoming.slice(0, 12)),
      decorate(dueSoon.slice(0, 12)),
      decorate(exploring),
      decorate(everything.slice(0, 24)),
    ]);

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        total,
        counts,
        needs_attention: attention,
        upcoming_events: events,
        due_soon: due,
        exploring: explore,
        recent,
        overdue_count: due.filter((m) => m.due_on && m.due_on < todayYmd).length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/digest] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the digest" },
      { status: 502 },
    );
  }
}
