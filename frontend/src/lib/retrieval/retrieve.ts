/**
 * Retrieval: hybrid search, then one call that gates relevance and answers.
 *
 * The gate remains non-negotiable. Measured on this corpus, gte-small scores an
 * unrelated query/document pair as high as 0.80 while a genuine match can sit at
 * 0.78 — the distributions overlap, so no cosine threshold can separate them.
 * What changed is that gating and answering now happen in a single model call:
 * as two calls they cost ~10s, merged they cost ~4s and still refuse when
 * nothing fits.
 *
 * The query planner was also removed from the hot path. It cost ~4.3s per ask,
 * and its filters could hide the correct answer (it once emitted
 * intent_modes:["REMEMBER"] for "what was that backpack I was looking at",
 * excluding the EXPLORE-tagged backpack). The answering model sees each
 * candidate's dates and types directly, so it can do that reasoning itself.
 */

import { answerWithGate } from "@/lib/agent";
import { searchMemories } from "@/lib/db/memories";
import type { ContentType, RetrievedMemory } from "@/lib/schemas/memory";

/** Over-fetch before gating: recall is cheap, precision comes from the gate. */
const CANDIDATE_POOL = 10;

export interface AnsweredQuestion {
  answer: string;
  short_message: string;
  memories: RetrievedMemory[];
  candidatesConsidered: number;
  matched: boolean;
  /** Candidates existed but the gate rejected all of them. */
  filteredToNothing: boolean;
}

/** Raw hybrid search, no model in the loop. Used by the search box. */
export async function retrieveCandidates(input: {
  userId: string;
  query: string;
  limit?: number;
  contentTypes?: ContentType[] | null;
  requireImage?: boolean;
}): Promise<RetrievedMemory[]> {
  return searchMemories({
    userId: input.userId,
    query: input.query,
    limit: input.limit ?? CANDIDATE_POOL,
    contentTypes: input.contentTypes ?? null,
    requireImage: input.requireImage ?? false,
  });
}

export function toAnswerContext(memories: RetrievedMemory[]) {
  return memories.map((memory) => ({
    id: memory.id,
    title: memory.title,
    type: memory.content_type,
    saved_on: memory.created_at.slice(0, 10),
    description: memory.description,
    text_on_screen: memory.ocr_text?.slice(0, 280) || null,
    tags: memory.tags,
    event: memory.event,
    place: memory.place,
    product: memory.product,
    person: memory.person,
    event_on: memory.event_on,
    due_on: memory.due_on,
    user_note: memory.user_note,
  }));
}

export async function askMemories(input: {
  userId: string;
  question: string;
  limit?: number;
  onText?: (chunk: string) => void;
}): Promise<AnsweredQuestion> {
  const candidates = await retrieveCandidates({
    userId: input.userId,
    query: input.question,
    limit: CANDIDATE_POOL,
  });

  if (!candidates.length) {
    return {
      answer: "",
      short_message: "",
      memories: [],
      candidatesConsidered: 0,
      matched: false,
      filteredToNothing: false,
    };
  }

  const result = await answerWithGate({
    question: input.question,
    memories: toAnswerContext(candidates),
    onText: input.onText,
  });

  if (!result.matched) {
    return {
      answer: "",
      short_message: "",
      memories: [],
      candidatesConsidered: candidates.length,
      matched: false,
      filteredToNothing: true,
    };
  }

  // Show the memories the answer actually drew on. If the model named none,
  // fall back to the top candidates rather than showing nothing.
  const used = new Set(result.used_ids);
  const cited = candidates.filter((m) => used.has(m.id));
  const shown = (cited.length ? cited : candidates.slice(0, input.limit ?? 5)).map((m) => ({
    ...m,
    relevance: "primary" as const,
  }));

  return {
    answer: result.answer,
    short_message: result.short_message,
    memories: shown.slice(0, input.limit ?? 8),
    candidatesConsidered: candidates.length,
    matched: true,
    filteredToNothing: false,
  };
}
