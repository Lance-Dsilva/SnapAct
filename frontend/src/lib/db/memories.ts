/**
 * The single gateway to SnapAct's memory table.
 *
 * Every operation here is a real database operation. Listing is an ORDER BY, not
 * a bundle of semantic probes; get-by-id is a primary key lookup, not a search
 * for the id string.
 */

import { getConfig } from "@/lib/config";
import { db } from "@/lib/db/supabase";
import { embed } from "@/lib/embeddings";
import { signImageUrl } from "@/lib/db/storage";
import type {
  ContentType,
  IntentMode,
  Memory,
  MemoryStatus,
  RetrievedMemory,
} from "@/lib/schemas/memory";

const TABLE = "memories";

/** Columns the app reads. Excludes `embedding` and `fts` — large and never used client-side. */
const COLUMNS = `
  id, user_id, client_request_id, status,
  source, capture_mode, captured_at, created_at, updated_at,
  image_path, image_bytes, image_mime,
  title, content_type, intent_mode, intent_summary, description, ocr_text, tags, entities,
  actionable, urgency, due_on, event_on, completed_at, suggested_actions,
  event, place, person, product,
  user_note, user_question, answer, citations,
  confidence, model, analysis, analysis_error, analysis_attempts,
  search_text
`;

export interface ListFilters {
  userId: string;
  limit?: number;
  offset?: number;
  contentTypes?: ContentType[];
  intentModes?: IntentMode[];
  status?: MemoryStatus[];
  tags?: string[];
  actionable?: boolean;
  includeCompleted?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  dueBefore?: string;
  hasImage?: boolean;
  orderBy?: "created_at" | "due_on" | "event_on";
  ascending?: boolean;
}

/**
 * Build the retrieval blob. This is what gets embedded and full-text indexed, so
 * it must contain everything a user might search by — and nothing boilerplate.
 * The old store prefixed every row with a shared token ("SnapAct screenshot
 * memory") to make listing work; that poisoned every embedding with identical
 * text. Listing is a query now, so the blob stays clean.
 */
export function buildSearchText(input: {
  title?: string | null;
  description?: string | null;
  ocr_text?: string | null;
  intent_summary?: string | null;
  tags?: string[] | null;
  entities?: Array<{ name: string }> | null;
  user_note?: string | null;
  user_question?: string | null;
  content_type?: string | null;
  place?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  product?: Record<string, unknown> | null;
  person?: Record<string, unknown> | null;
}): string {
  const facetValues = [input.place, input.event, input.product, input.person]
    .filter(Boolean)
    .flatMap((facet) => Object.values(facet as Record<string, unknown>))
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return [
    input.title,
    input.description,
    input.intent_summary,
    input.user_note,
    input.user_question,
    (input.tags || []).join(", "),
    (input.entities || []).map((e) => e.name).join(", "),
    facetValues.join(", "),
    input.content_type,
    input.ocr_text,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000);
}

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    ...row,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    entities: Array.isArray(row.entities) ? (row.entities as Memory["entities"]) : [],
    suggested_actions: Array.isArray(row.suggested_actions)
      ? (row.suggested_actions as Memory["suggested_actions"])
      : [],
    citations: Array.isArray(row.citations) ? (row.citations as Memory["citations"]) : [],
  } as Memory;
}

/** Create the row up front so a capture is durable before analysis runs. */
export async function createPendingMemory(input: {
  userId: string;
  clientRequestId: string;
  source?: string | null;
  captureMode?: string | null;
  capturedAt?: string | null;
  imagePath?: string | null;
  imageBytes?: number | null;
  imageMime?: string | null;
  userNote?: string | null;
  userQuestion?: string | null;
}): Promise<Memory> {
  const { data, error } = await db()
    .from(TABLE)
    .upsert(
      {
        user_id: input.userId,
        client_request_id: input.clientRequestId,
        status: "pending" satisfies MemoryStatus,
        source: input.source ?? null,
        capture_mode: input.captureMode ?? null,
        captured_at: input.capturedAt ?? null,
        image_path: input.imagePath ?? null,
        image_bytes: input.imageBytes ?? null,
        image_mime: input.imageMime ?? null,
        user_note: input.userNote ?? null,
        user_question: input.userQuestion ?? null,
        // A pending row is searchable by the little we know, so it is never a ghost.
        search_text: buildSearchText({
          user_note: input.userNote,
          user_question: input.userQuestion,
        }),
      },
      { onConflict: "user_id,client_request_id" },
    )
    .select(COLUMNS)
    .single();

  if (error) throw new Error(`createPendingMemory failed: ${error.message}`);
  return rowToMemory(data);
}

/** Apply analysis results and flip the row to ready, embedding in the same step. */
export async function completeMemory(input: {
  userId: string;
  clientRequestId: string;
  patch: Partial<Memory>;
  searchText: string;
  model?: string | null;
}): Promise<Memory> {
  const embedding = await embed(input.searchText).catch((error) => {
    console.warn("[memories] embedding failed; row stays lexically searchable", error);
    return null;
  });

  const { data, error } = await db()
    .from(TABLE)
    .update({
      ...input.patch,
      status: "ready" satisfies MemoryStatus,
      search_text: input.searchText,
      embedding,
      model: input.model ?? null,
      analysis_error: null,
    })
    .eq("user_id", input.userId)
    .eq("client_request_id", input.clientRequestId)
    .select(COLUMNS)
    .single();

  if (error) throw new Error(`completeMemory failed: ${error.message}`);
  return rowToMemory(data);
}

/**
 * Record a failure explicitly. The old pipeline left rows stuck reading
 * "pending analysis" forever with no record of why; those are now visible,
 * countable, and retryable.
 */
export async function failMemory(input: {
  userId: string;
  clientRequestId: string;
  error: string;
}): Promise<void> {
  const { data } = await db()
    .from(TABLE)
    .select("analysis_attempts")
    .eq("user_id", input.userId)
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();

  const attempts = Number(data?.analysis_attempts ?? 0) + 1;

  await db()
    .from(TABLE)
    .update({
      status: "failed" satisfies MemoryStatus,
      analysis_error: input.error.slice(0, 1000),
      analysis_attempts: attempts,
    })
    .eq("user_id", input.userId)
    .eq("client_request_id", input.clientRequestId);
}

export async function listMemories(filters: ListFilters): Promise<Memory[]> {
  let query = db()
    .from(TABLE)
    .select(COLUMNS)
    .eq("user_id", filters.userId);

  query = query.in("status", filters.status ?? ["ready"]);

  if (filters.contentTypes?.length) query = query.in("content_type", filters.contentTypes);
  if (filters.intentModes?.length) query = query.in("intent_mode", filters.intentModes);
  if (filters.tags?.length) query = query.overlaps("tags", filters.tags);
  if (filters.actionable !== undefined) query = query.eq("actionable", filters.actionable);
  if (filters.includeCompleted === false) query = query.is("completed_at", null);
  if (filters.createdAfter) query = query.gte("created_at", filters.createdAfter);
  if (filters.createdBefore) query = query.lte("created_at", filters.createdBefore);
  if (filters.dueBefore) query = query.lte("due_on", filters.dueBefore);
  if (filters.hasImage) query = query.not("image_path", "is", null);

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const { data, error } = await query
    .order(filters.orderBy ?? "created_at", {
      ascending: filters.ascending ?? false,
      nullsFirst: false,
    })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`listMemories failed: ${error.message}`);
  return (data ?? []).map(rowToMemory);
}

export async function countMemories(userId: string): Promise<number> {
  const { count, error } = await db()
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "ready");
  if (error) throw new Error(`countMemories failed: ${error.message}`);
  return count ?? 0;
}

export async function getMemory(userId: string, id: string): Promise<Memory | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const query = db().from(TABLE).select(COLUMNS).eq("user_id", userId);

  const { data, error } = await (isUuid
    ? query.or(`id.eq.${id},client_request_id.eq.${id}`)
    : query.eq("client_request_id", id)
  ).maybeSingle();

  if (error) throw new Error(`getMemory failed: ${error.message}`);
  return data ? rowToMemory(data) : null;
}

export async function updateMemory(
  userId: string,
  id: string,
  patch: Partial<Memory>,
): Promise<Memory | null> {
  const { data, error } = await db()
    .from(TABLE)
    .update(patch)
    .eq("user_id", userId)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`updateMemory failed: ${error.message}`);
  return data ? rowToMemory(data) : null;
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  const { error, count } = await db()
    .from(TABLE)
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(`deleteMemory failed: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function typeCounts(userId: string): Promise<Record<string, number>> {
  const { data, error } = await db().rpc("memory_type_counts", { p_user_id: userId });
  if (error) throw new Error(`typeCounts failed: ${error.message}`);
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ content_type: string; total: number }>) {
    out[row.content_type] = Number(row.total);
  }
  return out;
}

/** Rows whose analysis never completed — the repair queue. */
export async function findStalledMemories(userId: string, maxAttempts = 3): Promise<Memory[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select(COLUMNS)
    .eq("user_id", userId)
    .in("status", ["pending", "failed"])
    .lt("analysis_attempts", maxAttempts)
    .order("created_at", { ascending: true })
    .limit(25);
  if (error) throw new Error(`findStalledMemories failed: ${error.message}`);
  return (data ?? []).map(rowToMemory);
}

export interface SearchOptions {
  userId: string;
  query: string;
  limit?: number;
  contentTypes?: ContentType[] | null;
  intentModes?: IntentMode[] | null;
  tags?: string[] | null;
  createdAfter?: string | null;
  createdBefore?: string | null;
  actionable?: boolean | null;
  includeCompleted?: boolean;
  requireImage?: boolean;
  minSimilarity?: number;
}

/**
 * Hybrid search: pgvector semantics fused with tsvector lexical matching.
 * Returns real scores. Relevance judgement belongs to the caller's gate — see
 * lib/retrieval/retrieve.ts for why a similarity threshold cannot do that job.
 */
export async function searchMemories(opts: SearchOptions): Promise<RetrievedMemory[]> {
  const cfg = getConfig();
  const embedding = await embed(opts.query).catch((error) => {
    console.warn("[memories] query embedding failed; lexical-only search", error);
    return null;
  });

  const { data, error } = await db().rpc("search_memories", {
    p_user_id: opts.userId,
    p_query: opts.query,
    p_embedding: embedding,
    p_limit: Math.min(Math.max(opts.limit ?? 20, 1), 100),
    p_min_similarity: opts.minSimilarity ?? 0.7,
    p_content_types: opts.contentTypes?.length ? opts.contentTypes : null,
    p_intent_modes: opts.intentModes?.length ? opts.intentModes : null,
    p_tags: opts.tags?.length ? opts.tags : null,
    p_created_after: opts.createdAfter ?? null,
    p_created_before: opts.createdBefore ?? null,
    p_actionable: opts.actionable ?? null,
    p_include_done: opts.includeCompleted ?? true,
    p_require_image: opts.requireImage ?? false,
  });

  if (error) throw new Error(`searchMemories failed: ${error.message}`);

  const hits = (data ?? []) as Array<{
    id: string;
    similarity: number;
    lexical_rank: number;
    score: number;
    matched_by: RetrievedMemory["matched_by"];
  }>;
  if (!hits.length) return [];

  const { data: rows, error: rowError } = await db()
    .from(TABLE)
    .select(COLUMNS)
    .in("id", hits.map((h) => h.id));
  if (rowError) throw new Error(`searchMemories hydrate failed: ${rowError.message}`);

  const byId = new Map((rows ?? []).map((row) => [String(row.id), rowToMemory(row)]));

  const ordered: RetrievedMemory[] = [];
  for (const hit of hits) {
    const memory = byId.get(hit.id);
    if (!memory) continue;
    ordered.push({
      ...memory,
      image_url: null,
      similarity: Number(hit.similarity ?? 0),
      lexical_rank: Number(hit.lexical_rank ?? 0),
      score: Number(hit.score ?? 0),
      matched_by: hit.matched_by,
    });
  }

  return withImageUrls(ordered, cfg.signedUrlTtlSeconds);
}

/** Attach short-lived signed URLs. The bucket stays private. */
export async function withImageUrls<T extends { image_path: string | null }>(
  items: T[],
  ttlSeconds?: number,
): Promise<Array<T & { image_url: string | null }>> {
  const ttl = ttlSeconds ?? getConfig().signedUrlTtlSeconds;
  const paths = [...new Set(items.map((i) => i.image_path).filter((p): p is string => Boolean(p)))];
  const signed = await signImageUrl(paths, ttl);
  return items.map((item) => ({
    ...item,
    image_url: item.image_path ? signed.get(item.image_path) ?? null : null,
  }));
}
