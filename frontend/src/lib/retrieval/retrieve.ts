/**
 * Retrieval: plan -> hybrid search -> relevance gate.
 *
 * The gate is the important part. Measured on this corpus, gte-small scores an
 * unrelated query/document pair as high as 0.80 while a genuine match can sit at
 * 0.78 — the distributions overlap, so no cosine threshold can separate them.
 * That is precisely how the previous stack answered nonsense queries with
 * confident nonsense. A model judges relevance here, and is allowed to return
 * nothing.
 */

import { judgeRelevance, planQuery, type QueryPlan } from "@/lib/agent";
import { searchMemories } from "@/lib/db/memories";
import { coerceContentType, type RetrievedMemory } from "@/lib/schemas/memory";

/** Over-fetch before gating: recall is cheap here, precision comes from the gate. */
const CANDIDATE_POOL = 24;

export interface RetrievalResult {
  memories: RetrievedMemory[];
  plan: QueryPlan | null;
  candidatesConsidered: number;
  rejected: number;
  /** True when candidates existed but none survived the gate. */
  filteredToNothing: boolean;
}

function summarize(memory: RetrievedMemory): string {
  return [memory.description, memory.ocr_text?.slice(0, 400)]
    .filter(Boolean)
    .join(" ")
    .slice(0, 600);
}

export async function retrieve(input: {
  userId: string;
  question: string;
  limit?: number;
  usePlanner?: boolean;
  useGate?: boolean;
  requireImage?: boolean;
}): Promise<RetrievalResult> {
  const limit = input.limit ?? 8;

  let plan: QueryPlan | null = null;
  if (input.usePlanner !== false) {
    plan = await planQuery(input.question).catch((error) => {
      console.warn("[retrieve] planner failed; searching with the raw question", error);
      return null;
    });
  }

  const query = plan?.semantic_query || input.question;

  let candidates = await searchMemories({
    userId: input.userId,
    query,
    limit: CANDIDATE_POOL,
    contentTypes: plan?.content_types?.map(coerceContentType) ?? null,
    tags: plan?.tags ?? null,
    createdAfter: plan?.created_after ? `${plan.created_after}T00:00:00Z` : null,
    createdBefore: plan?.created_before ? `${plan.created_before}T23:59:59Z` : null,
    actionable: plan?.actionable ?? null,
    requireImage: input.requireImage ?? false,
  });

  // Widen if the plan's filters were too narrow. A wrong filter must never be able
  // to hide the answer — the gate downstream can reject extra candidates cheaply,
  // but it can never recover one that was filtered out before it ran.
  const wasFiltered = Boolean(
    plan?.content_types?.length || plan?.tags?.length || plan?.actionable,
  );
  if (candidates.length < 3 && wasFiltered) {
    candidates = await searchMemories({
      userId: input.userId,
      query,
      limit: CANDIDATE_POOL,
      createdAfter: plan?.created_after ? `${plan.created_after}T00:00:00Z` : null,
      createdBefore: plan?.created_before ? `${plan.created_before}T23:59:59Z` : null,
      requireImage: input.requireImage ?? false,
    });
  }

  if (!candidates.length) {
    return { memories: [], plan, candidatesConsidered: 0, rejected: 0, filteredToNothing: false };
  }

  if (input.useGate === false) {
    return {
      memories: candidates.slice(0, limit),
      plan,
      candidatesConsidered: candidates.length,
      rejected: 0,
      filteredToNothing: false,
    };
  }

  const verdicts = await judgeRelevance(
    input.question,
    candidates.map((memory) => ({
      id: memory.id,
      title: memory.title || "Untitled",
      type: memory.content_type,
      description: summarize(memory),
      date: memory.created_at.slice(0, 10),
    })),
  ).catch((error) => {
    console.warn("[retrieve] relevance gate failed", error);
    return null;
  });

  // If the gate itself errored, fall back to lexical evidence: a tsvector match is
  // real evidence of relevance, a bare semantic neighbour is not.
  if (!verdicts) {
    const lexical = candidates.filter((m) => m.matched_by !== "semantic");
    return {
      memories: lexical.slice(0, limit),
      plan,
      candidatesConsidered: candidates.length,
      rejected: candidates.length - lexical.length,
      filteredToNothing: lexical.length === 0,
    };
  }

  const byId = new Map(candidates.map((m) => [m.id, m]));
  const kept: RetrievedMemory[] = [];

  for (const rank of ["primary", "supporting"] as const) {
    for (const verdict of verdicts) {
      if (verdict.verdict !== rank) continue;
      const memory = byId.get(verdict.id);
      if (!memory || kept.some((k) => k.id === memory.id)) continue;
      kept.push({ ...memory, relevance: rank, relevance_reason: verdict.reason });
    }
  }

  return {
    memories: kept.slice(0, limit),
    plan,
    candidatesConsidered: candidates.length,
    rejected: candidates.length - kept.length,
    filteredToNothing: kept.length === 0,
  };
}

/** The shape handed to the synthesis model and returned to clients. */
export function toAnswerContext(memories: RetrievedMemory[]) {
  return memories.map((memory) => ({
    id: memory.id,
    title: memory.title,
    type: memory.content_type,
    saved_on: memory.created_at.slice(0, 10),
    description: memory.description,
    text_on_screen: memory.ocr_text?.slice(0, 800) || null,
    tags: memory.tags,
    event: memory.event,
    place: memory.place,
    product: memory.product,
    person: memory.person,
    event_on: memory.event_on,
    due_on: memory.due_on,
    user_note: memory.user_note,
    relevance: memory.relevance,
  }));
}
