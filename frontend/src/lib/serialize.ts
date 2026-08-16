import { CONTENT_TYPE_LABELS, type Memory, type RetrievedMemory } from "@/lib/schemas/memory";

/** One place that decides the client-facing shape of a memory. */
export function serializeMemory(memory: Memory & { image_url?: string | null }) {
  return {
    id: memory.id,
    status: memory.status,
    title: memory.title || "Untitled screenshot",
    description: memory.description || "",
    content_type: memory.content_type,
    content_type_label: CONTENT_TYPE_LABELS[memory.content_type],
    intent_mode: memory.intent_mode,
    intent_summary: memory.intent_summary,
    tags: memory.tags,
    entities: memory.entities,

    actionable: memory.actionable,
    urgency: memory.urgency,
    due_on: memory.due_on,
    event_on: memory.event_on,
    completed: Boolean(memory.completed_at),
    suggested_actions: memory.suggested_actions,

    event: memory.event,
    place: memory.place,
    person: memory.person,
    product: memory.product,

    user_note: memory.user_note,
    user_question: memory.user_question,
    answer: memory.answer,
    citations: memory.citations,

    image_url: memory.image_url ?? null,
    created_at: memory.created_at,
    captured_at: memory.captured_at,
    source: memory.source,
    confidence: memory.confidence,
    ocr_text: memory.ocr_text,
    analysis_error: memory.analysis_error,
  };
}

export function serializeRetrieved(memory: RetrievedMemory) {
  return {
    ...serializeMemory(memory),
    score: memory.score,
    similarity: memory.similarity,
    matched_by: memory.matched_by,
    relevance: memory.relevance ?? null,
    relevance_reason: memory.relevance_reason ?? null,
  };
}

export type SerializedMemory = ReturnType<typeof serializeMemory>;
export type SerializedRetrieved = ReturnType<typeof serializeRetrieved>;
