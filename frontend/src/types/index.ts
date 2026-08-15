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

export interface SuggestedAction {
  type: string;
  label: string;
  url?: string | null;
  due_at?: string | null;
  reason?: string | null;
}

export interface Citation {
  title?: string | null;
  url: string;
  source?: string;
  snippet?: string | null;
}

export interface AgentActivity {
  steps: string[];
  web_search_used?: boolean;
  x_search_used?: boolean;
  live_verification?: boolean;
  live_verification_failed?: boolean;
  notes?: string | null;
}

export interface MemoryAnalysis {
  title: string;
  content_type: ContentType;
  intent_mode: IntentMode;
  intent_summary: string;
  description: string;
  searchable_text: string;
  tags: string[];
  entities: { name: string; type: string }[];
  extracted_text_summary?: string | null;
  actionable: boolean;
  urgency: string;
  needs_live_search: boolean;
  suggested_actions: SuggestedAction[];
  temporal?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  person_followup?: Record<string, unknown> | null;
  place?: Record<string, unknown> | null;
  product?: Record<string, unknown> | null;
  confidence: number;
  answer?: string | null;
  user_question?: string | null;
  user_description?: string | null;
  citations: Citation[];
  agent_activity: string[] | AgentActivity;
  short_message?: string | null;
  web_search_used?: boolean;
  live_verification_failed?: boolean;
}

export interface CaptureResponse {
  memory_id: string;
  short_message: string;
  answer?: string | null;
  analysis: MemoryAnalysis;
  suggested_actions: SuggestedAction[];
  citations: Citation[];
  image_url?: string | null;
  agent_activity: string[] | AgentActivity;
  duplicate: boolean;
  degraded: boolean;
  warning?: string | null;
}

export interface SearchResultItem {
  memory_id: string;
  title: string;
  description: string;
  image_url?: string | null;
  content_type: string;
  intent_mode: string;
  score: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface AskResponse {
  answer: string;
  memories: SearchResultItem[];
  citations: Citation[];
  short_message?: string | null;
  agent_activity?: string[];
}

export interface AttentionItem {
  memory_id: string;
  title: string;
  reason: string;
  priority: number;
  content_type?: ContentType | null;
  intent_mode?: IntentMode | null;
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

export interface MemoryDetail {
  memory_id: string;
  title: string;
  description: string;
  content_type: string;
  intent_mode: string;
  image_url?: string | null;
  tags: string[];
  analysis?: MemoryAnalysis | null;
  metadata?: Record<string, unknown>;
  question?: string | null;
  user_description?: string | null;
  completed?: boolean;
  demo_seed?: boolean;
  created_at?: string;
  source?: string | null;
  captured_at?: string | null;
}

export function activitySteps(
  activity: string[] | AgentActivity | null | undefined,
): string[] {
  if (!activity) return [];
  if (Array.isArray(activity)) return activity;
  return activity.steps || [];
}
