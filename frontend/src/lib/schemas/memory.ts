/** Canonical SnapAct types. These mirror the Postgres enums exactly. */

export const CONTENT_TYPES = [
  "event",
  "place",
  "product",
  "person",
  "job",
  "quote",
  "knowledge",
  "idea",
  "task",
  "message",
  "media",
  "document",
  "receipt",
  "app_ui",
  "other",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const INTENT_MODES = ["REMEMBER", "EXPLORE", "ACT"] as const;
export type IntentMode = (typeof INTENT_MODES)[number];

export const URGENCIES = ["none", "low", "medium", "high"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const MEMORY_STATUSES = ["pending", "ready", "failed"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const ACTION_TYPES = [
  "open_url",
  "register",
  "add_calendar",
  "remind",
  "follow_up",
  "research",
  "buy",
  "view",
  "none",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export type CaptureMode = "save" | "ask" | "describe";

/** Human-facing labels, used by the UI and by prompts so both agree. */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  event: "Event",
  place: "Place",
  product: "Product",
  person: "Person",
  job: "Job",
  quote: "Quote",
  knowledge: "Knowledge",
  idea: "Idea",
  task: "Task",
  message: "Conversation",
  media: "Media",
  document: "Document",
  receipt: "Receipt",
  app_ui: "App screen",
  other: "Other",
};

export interface Entity {
  name: string;
  type: string;
}

export interface SuggestedAction {
  type: ActionType | string;
  label: string;
  url?: string | null;
  due_on?: string | null;
  reason?: string | null;
}

export interface Citation {
  title?: string | null;
  url: string;
  source?: string | null;
  snippet?: string | null;
}

/** What the vision model is asked to produce for one screenshot. */
export interface ScreenshotAnalysis {
  title: string;
  content_type: ContentType;
  intent_mode: IntentMode;
  intent_summary: string;
  description: string;
  ocr_text: string;
  tags: string[];
  entities: Entity[];
  actionable: boolean;
  urgency: Urgency;
  confidence: number;
  due_on: string | null;
  event_on: string | null;
  suggested_actions: SuggestedAction[];
  event: Record<string, unknown> | null;
  place: Record<string, unknown> | null;
  person: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  answer: string | null;
  citations: Citation[];
  short_message: string;
  agent_activity: string[];
}

/** One row of public.memories, as the app sees it. */
export interface Memory {
  id: string;
  user_id: string;
  client_request_id: string;
  status: MemoryStatus;

  source: string | null;
  capture_mode: string | null;
  captured_at: string | null;
  created_at: string;
  updated_at: string;

  image_path: string | null;
  image_bytes: number | null;
  image_mime: string | null;

  title: string | null;
  content_type: ContentType;
  intent_mode: IntentMode;
  intent_summary: string | null;
  description: string | null;
  ocr_text: string | null;
  tags: string[];
  entities: Entity[];

  actionable: boolean;
  urgency: Urgency;
  due_on: string | null;
  event_on: string | null;
  completed_at: string | null;
  suggested_actions: SuggestedAction[];

  event: Record<string, unknown> | null;
  place: Record<string, unknown> | null;
  person: Record<string, unknown> | null;
  product: Record<string, unknown> | null;

  user_note: string | null;
  user_question: string | null;
  answer: string | null;
  citations: Citation[];

  confidence: number | null;
  model: string | null;
  analysis: ScreenshotAnalysis | null;
  analysis_error: string | null;
  analysis_attempts: number;

  search_text: string | null;
}

/** A memory decorated with retrieval provenance. */
export interface RetrievedMemory extends Memory {
  image_url: string | null;
  similarity: number;
  lexical_rank: number;
  score: number;
  matched_by: "hybrid" | "lexical" | "semantic";
  /** Set once the relevance gate has judged this candidate. */
  relevance?: "primary" | "supporting";
  relevance_reason?: string | null;
}

export function isContentType(value: unknown): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}

export function coerceContentType(value: unknown): ContentType {
  const raw = String(value ?? "").toLowerCase().trim();
  if (isContentType(raw)) return raw;
  // Tolerate near-misses from the model rather than silently dumping to "other".
  const aliases: Record<string, ContentType> = {
    person_followup: "person",
    people: "person",
    contact: "person",
    conversation: "message",
    tweet: "message",
    post: "message",
    dm: "message",
    chat: "message",
    entertainment: "media",
    movie: "media",
    film: "media",
    show: "media",
    tv: "media",
    music: "media",
    song: "media",
    book: "media",
    video: "media",
    restaurant: "place",
    venue: "place",
    location: "place",
    shopping: "product",
    item: "product",
    listing: "product",
    article: "knowledge",
    docs: "knowledge",
    documentation: "knowledge",
    reference: "knowledge",
    tutorial: "knowledge",
    note: "idea",
    thought: "idea",
    todo: "task",
    reminder: "task",
    ticket: "document",
    confirmation: "document",
    form: "document",
    invoice: "receipt",
    order: "receipt",
    purchase: "receipt",
    settings: "app_ui",
    home_screen: "app_ui",
    homescreen: "app_ui",
    ui: "app_ui",
    screen: "app_ui",
    app: "app_ui",
  };
  return aliases[raw] ?? "other";
}

export function coerceIntentMode(value: unknown): IntentMode {
  const raw = String(value ?? "").toUpperCase().trim();
  return (INTENT_MODES as readonly string[]).includes(raw) ? (raw as IntentMode) : "REMEMBER";
}

export function coerceUrgency(value: unknown): Urgency {
  const raw = String(value ?? "").toLowerCase().trim();
  return (URGENCIES as readonly string[]).includes(raw) ? (raw as Urgency) : "none";
}

/** Accepts YYYY-MM-DD only; anything else becomes null rather than a bogus date. */
export function coerceDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : raw;
}
