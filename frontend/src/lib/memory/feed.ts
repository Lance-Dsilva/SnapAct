import { generateHomeIntelligence } from "@/lib/agents/snapact-agent";
import type {
  AttentionItem,
  HomeFeedPlan,
  MemoryRecord,
  SuggestedAction,
} from "@/lib/schemas/memory";

function titleOf(mem: MemoryRecord) {
  return mem.analysis?.title || String(mem.metadata.title || mem.memory_id);
}

function contentTypeOf(mem: MemoryRecord) {
  return mem.analysis?.content_type || (mem.metadata.content_type as string) || null;
}

function intentOf(mem: MemoryRecord) {
  return mem.analysis?.intent_mode || (mem.metadata.intent_mode as string) || null;
}

function priorityScore(mem: MemoryRecord): number {
  let score = 0;
  const urgency = mem.analysis?.urgency || mem.metadata.urgency || "none";
  score += { none: 0, low: 0.1, medium: 0.25, high: 0.45 }[String(urgency)] || 0;
  const intent = intentOf(mem);
  if (intent === "ACT") score += 0.25;
  else if (intent === "EXPLORE") score += 0.1;
  if (mem.analysis?.actionable || mem.metadata.actionable) score += 0.15;
  if (!mem.completed) score += 0.1;
  else score -= 0.2;
  return Math.min(score, 1);
}

export function buildDeterministicHints(memories: MemoryRecord[]) {
  return memories
    .map((mem) => {
      const ct = contentTypeOf(mem);
      const intent = intentOf(mem);
      const score = priorityScore(mem);
      let bucket = "suggested_explorations";
      let reason = mem.analysis?.intent_summary || "Saved screenshot";
      if (ct === "event" || mem.analysis?.event) {
        bucket = "upcoming_events";
        reason = "Upcoming event";
      }
      if (ct === "person_followup" || mem.analysis?.person_followup) {
        bucket = "follow_ups";
        const topic = (mem.analysis?.person_followup as { topic?: string } | undefined)?.topic;
        reason = topic ? `Follow up about ${topic}` : "Follow-up needed";
      }
      if (intent === "ACT" && !mem.completed && score >= 0.4) {
        bucket = "needs_attention";
        if (ct === "event") reason = "Registration / event approaching";
      }
      if (intent === "EXPLORE") {
        bucket = "suggested_explorations";
        reason = "Worth exploring";
      }
      if (ct === "quote") {
        bucket = "quotes";
        reason = "Saved quote";
      }
      return {
        memory_id: mem.memory_id,
        title: titleOf(mem),
        reason,
        priority: score,
        bucket,
        content_type: ct,
        intent_mode: intent,
        image_url: mem.image_url,
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

export async function refreshHomeFeed(memories: MemoryRecord[]): Promise<HomeFeedPlan> {
  const hints = buildDeterministicHints(memories);
  let plan: Record<string, unknown> = {};
  try {
    plan = (await generateHomeIntelligence({ memories, rankedHints: hints })) as Record<
      string,
      unknown
    >;
  } catch {
    plan = {};
  }

  const byId = new Map(memories.map((m) => [m.memory_id, m]));

  function hydrate(
    items: unknown,
    fallbackBucket: string,
  ): AttentionItem[] {
    const raw = Array.isArray(items)
      ? items
      : hints.filter((h) => h.bucket === fallbackBucket);
    const out: AttentionItem[] = [];
    for (const item of raw.slice(0, 8) as Array<Record<string, unknown>>) {
      const mid = String(item.memory_id || "");
      const mem = byId.get(mid);
      if (!mem) continue;
      const action = mem.analysis?.suggested_actions?.[0] as SuggestedAction | undefined;
      out.push({
        memory_id: mid,
        title: String(item.title || titleOf(mem)),
        reason: String(item.reason || ""),
        priority: Number(item.priority || priorityScore(mem)),
        content_type: contentTypeOf(mem),
        intent_mode: intentOf(mem),
        image_url: mem.image_url,
        suggested_action: action || null,
      });
    }
    return out;
  }

  const recent: AttentionItem[] = [...memories]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 12)
    .map((m) => ({
      memory_id: m.memory_id,
      title: titleOf(m),
      reason: m.analysis?.intent_summary || "Recent capture",
      priority: priorityScore(m),
      content_type: contentTypeOf(m),
      intent_mode: intentOf(m),
      image_url: m.image_url,
    }));

  return {
    generated_at: new Date().toISOString(),
    needs_attention: hydrate(plan.needs_attention, "needs_attention"),
    upcoming_events: hydrate(plan.upcoming_events, "upcoming_events"),
    follow_ups: hydrate(plan.follow_ups, "follow_ups"),
    suggested_explorations: hydrate(plan.suggested_explorations, "suggested_explorations"),
    quotes: hydrate(null, "quotes"),
    recent,
  };
}
