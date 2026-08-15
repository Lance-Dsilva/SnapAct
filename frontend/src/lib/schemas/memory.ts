export type ContentType =
  | "event"
  | "quote"
  | "knowledge"
  | "idea"
  | "place"
  | "product"
  | "job"
  | "person_followup"
  | "conversation"
  | "document"
  | "other";

export type IntentMode = "REMEMBER" | "EXPLORE" | "ACT";

export type Urgency = "none" | "low" | "medium" | "high";

export type ActionType =
  | "open_url"
  | "register"
  | "add_calendar"
  | "remind"
  | "follow_up"
  | "view"
  | "research"
  | "save"
  | "none";

export type CaptureMode = "save" | "ask" | "describe";

export interface Entity {
  name: string;
  type: string;
}

export interface SuggestedAction {
  type: ActionType | string;
  label: string;
  url?: string | null;
  due_at?: string | null;
  reason?: string | null;
}

export interface Citation {
  title?: string | null;
  url: string;
  source?: "web" | "x" | "screenshot" | "other" | string;
  snippet?: string | null;
}

export interface MemoryAnalysis {
  title: string;
  content_type: ContentType;
  intent_mode: IntentMode;
  intent_summary: string;
  description: string;
  searchable_text: string;
  tags: string[];
  entities: Entity[];
  extracted_text_summary?: string | null;
  actionable: boolean;
  urgency: Urgency | string;
  needs_live_search: boolean;
  confidence: number;
  suggested_actions: SuggestedAction[];
  temporal?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  person_followup?: Record<string, unknown> | null;
  place?: Record<string, unknown> | null;
  product?: Record<string, unknown> | null;
  answer?: string | null;
  user_question?: string | null;
  user_description?: string | null;
  source?: string | null;
  citations: Citation[];
  short_message?: string | null;
  /** High-level observable activity (not private CoT). */
  agent_activity: string[];
  web_search_used?: boolean;
  live_verification?: boolean;
  live_verification_failed?: boolean;
}

export interface MemoryRecord {
  memory_id: string;
  user_id: string;
  image_url?: string | null;
  created_at: string;
  updated_at?: string | null;
  searchable_text: string;
  metadata: Record<string, unknown>;
  analysis?: MemoryAnalysis | null;
  source?: string | null;
  captured_at?: string | null;
  question?: string | null;
  user_description?: string | null;
  completed?: boolean;
  client_request_id?: string | null;
}

export interface MemorySearchHit {
  memory_id: string;
  score: number;
  image_url?: string | null;
  metadata: Record<string, unknown>;
  analysis?: MemoryAnalysis | null;
}

export interface AttentionItem {
  memory_id: string;
  title: string;
  reason: string;
  priority: number;
  content_type?: ContentType | string | null;
  intent_mode?: IntentMode | string | null;
  image_url?: string | null;
  suggested_action?: SuggestedAction | null;
}

export interface HomeFeedPlan {
  generated_at: string;
  needs_attention: AttentionItem[];
  upcoming_events: AttentionItem[];
  follow_ups: AttentionItem[];
  suggested_explorations: AttentionItem[];
  quotes: AttentionItem[];
  recent: AttentionItem[];
}

export const MEMORY_ANALYSIS_JSON_HINT = `
Return ONLY valid JSON with these fields:
{
  "title": string,
  "content_type": "event"|"quote"|"knowledge"|"idea"|"place"|"product"|"job"|"person_followup"|"conversation"|"document"|"other",
  "intent_mode": "REMEMBER"|"EXPLORE"|"ACT",
  "intent_summary": string,
  "description": string,
  "searchable_text": string,
  "tags": string[],
  "entities": [{"name": string, "type": string}],
  "extracted_text_summary": string|null,
  "actionable": boolean,
  "urgency": "none"|"low"|"medium"|"high",
  "needs_live_search": boolean,
  "confidence": number,
  "suggested_actions": [{"type": string, "label": string, "url": string|null, "due_at": string|null, "reason": string|null}],
  "temporal": object|null,
  "event": object|null,
  "person_followup": object|null,
  "place": object|null,
  "product": object|null,
  "answer": string|null,
  "citations": [{"title": string|null, "url": string, "source": "web"|"screenshot"|"other", "snippet": string|null}],
  "short_message": string,
  "agent_activity": string[]
}
`.trim();
