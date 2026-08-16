import type { SerializedMemory, SerializedRetrieved } from "@/lib/serialize";

export type Memory = SerializedMemory;
export type RetrievedMemory = SerializedRetrieved;

export type ContentType = Memory["content_type"];
export type IntentMode = Memory["intent_mode"];

export interface MemoryList {
  memories: Memory[];
  total: number;
  counts: Record<string, number>;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface Digest {
  generated_at: string;
  total: number;
  counts: Record<string, number>;
  needs_attention: Memory[];
  upcoming_events: Memory[];
  due_soon: Memory[];
  exploring: Memory[];
  recent: Memory[];
  overdue_count: number;
}

export interface AskResponse {
  answer: string;
  short_message?: string;
  memories: RetrievedMemory[];
  considered?: number;
  rejected?: number;
}

export interface SearchResponse {
  query: string;
  results: RetrievedMemory[];
  considered: number;
  rejected: number;
  filtered_to_nothing: boolean;
}

export interface CaptureResponse {
  memory_id: string;
  status: "pending" | "ready" | "failed";
  duplicate: boolean;
  title: string;
  content_type: ContentType;
  intent_mode: IntentMode;
  description: string;
  short_message: string;
  answer: string | null;
  tags: string[];
  suggested_actions: Memory["suggested_actions"];
  citations: Memory["citations"];
  due_on: string | null;
  event_on: string | null;
  confidence: number;
  image_url: string | null;
  agent_activity: string[];
  model: string;
  tools_used: string[];
  duration_ms: number;
  error?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  checks: Record<string, { ok: boolean; detail?: string }>;
}
