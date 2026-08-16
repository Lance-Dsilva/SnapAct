/**
 * SnapAct's interface to the Cursor SDK.
 *
 * Two models: a vision model for screenshots, a cheap fast model for retrieval
 * planning, relevance gating, and answer synthesis.
 */

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, Cursor, CursorAgentError, JsonlLocalAgentStore } from "@cursor/sdk";
import { getConfig } from "@/lib/config";
import {
  ANSWER_SYSTEM,
  QUERY_PLANNER_SYSTEM,
  RELEVANCE_GATE_SYSTEM,
  SCREENSHOT_SYSTEM,
  buildAnswerPrompt,
  buildQueryPlannerPrompt,
  buildRelevanceGatePrompt,
  buildScreenshotPrompt,
} from "@/lib/prompts";
import {
  coerceContentType,
  coerceDate,
  coerceIntentMode,
  coerceUrgency,
  type ScreenshotAnalysis,
} from "@/lib/schemas/memory";

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code = "agent_error",
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export interface RunMeta {
  model: string;
  durationMs: number;
  toolsUsed: string[];
  webSearchUsed: boolean;
}

function writableSdkRoot() {
  const root = join(tmpdir(), "snapact-sdk");
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "agent-store"), { recursive: true });
  // Vercel lambdas have a read-only HOME; the Cursor SDK mkdirs under ~/.cursor.
  process.env.HOME = tmpdir();
  process.env.XDG_CACHE_HOME = join(tmpdir(), "cache");
  mkdirSync(process.env.XDG_CACHE_HOME, { recursive: true });
  return root;
}

/** Models wrap JSON in prose or fences often enough that this must be tolerant. */
export function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = (text || "").trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export function unescapeModelText(text: string) {
  return (text || "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .trim();
}

async function run(input: {
  system: string;
  user: string;
  imageBase64?: string;
  mimeType?: string;
  model?: string;
  tools?: string[];
  label: string;
  onText?: (chunk: string) => void;
}): Promise<{ text: string; meta: RunMeta }> {
  const cfg = getConfig();
  const modelId = input.model || cfg.cursorModel;
  if (!modelId) {
    throw new AgentError("CURSOR_MODEL is not configured.", "missing_model");
  }

  const started = Date.now();
  const toolsUsed = new Set<string>();

  try {
    await using agent = await Agent.create({
      ...(cfg.cursorApiKey ? { apiKey: cfg.cursorApiKey } : {}),
      model: { id: modelId },
      local: {
        cwd: writableSdkRoot(),
        store: new JsonlLocalAgentStore(join(writableSdkRoot(), "agent-store")),
        settingSources: [],
      },
      tools: input.tools ?? [],
      disallowedTools: ["shell", "edit", "delete", "generateImage"],
    });

    const message = input.imageBase64
      ? {
          text: `${input.system}\n\n${input.user}`,
          images: [{ data: input.imageBase64, mimeType: input.mimeType || "image/png" }],
        }
      : `${input.system}\n\n${input.user}`;

    const sent = await agent.send(message);

    let streamed = "";
    for await (const event of sent.stream()) {
      if (event.type === "tool_call" && event.name) toolsUsed.add(String(event.name));
      if (input.onText && event.type === "assistant" && "message" in event) {
        const content = (event.message?.content || []) as Array<{ type?: string; text?: string }>;
        const text = content
          .map((block) => (block?.type === "text" ? String(block.text || "") : ""))
          .join("");
        if (text.length > streamed.length) {
          input.onText(text.slice(streamed.length));
          streamed = text;
        }
      }
    }

    const result = await sent.wait();
    if (result.status === "error") {
      throw new AgentError(
        result.error?.message || "Cursor run failed",
        result.error?.code || "run_error",
        true,
      );
    }

    const durationMs = Date.now() - started;
    console.info(
      `[agent] ${input.label} model=${modelId} ${durationMs}ms tools=${[...toolsUsed].join(",") || "-"}`,
    );

    return {
      text: result.result || "",
      meta: {
        model: modelId,
        durationMs,
        toolsUsed: [...toolsUsed],
        webSearchUsed: [...toolsUsed].some((t) => /web/i.test(t)),
      },
    };
  } catch (err) {
    if (err instanceof AgentError) throw err;
    if (err instanceof CursorAgentError) {
      throw new AgentError(err.message, "cursor_error", Boolean(err.isRetryable));
    }
    throw new AgentError(err instanceof Error ? err.message : String(err), "unknown");
  }
}

/* ----------------------------------------------------------- screenshot */

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asFacet(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const BANNED_TAGS = new Set(["screenshot", "image", "photo", "saved", "picture", "capture"]);

/**
 * Validate model output into a well-formed analysis. Everything is clamped to the
 * schema here so nothing downstream has to defend against a malformed field.
 */
export function validateAnalysis(
  raw: Record<string, unknown>,
  ctx: { mode: string; capturedAt?: string | null },
): ScreenshotAnalysis {
  const contentType = coerceContentType(raw.content_type);
  const title = String(raw.title || "").trim().slice(0, 120) || "Untitled screenshot";

  const tags = [
    ...new Set(
      asArray<unknown>(raw.tags)
        .map((tag) => String(tag || "").toLowerCase().trim())
        .filter((tag) => tag.length > 1 && tag.length <= 40)
        .filter((tag) => !BANNED_TAGS.has(tag) && tag !== contentType),
    ),
  ].slice(0, 8);

  const confidence = Math.min(Math.max(Number(raw.confidence ?? 0.5) || 0.5, 0), 1);

  const actions = asArray<Record<string, unknown>>(raw.suggested_actions)
    .filter((action) => action && String(action.label || "").trim())
    .slice(0, 3)
    .map((action) => {
      const url = String(action.url || "").trim();
      return {
        type: String(action.type || "view"),
        label: String(action.label).trim().slice(0, 60),
        // Drop anything that is not a real absolute URL — invented links are worse than none.
        url: /^https?:\/\/\S+$/i.test(url) ? url : null,
        due_on: coerceDate(action.due_on),
        reason: action.reason ? String(action.reason).slice(0, 200) : null,
      };
    });

  const citations = asArray<Record<string, unknown>>(raw.citations)
    .filter((c) => /^https?:\/\/\S+$/i.test(String(c?.url || "")))
    .slice(0, 6)
    .map((c) => ({
      title: c.title ? String(c.title).slice(0, 160) : null,
      url: String(c.url),
      source: c.source ? String(c.source) : "web",
      snippet: c.snippet ? String(c.snippet).slice(0, 300) : null,
    }));

  const description = String(raw.description || "").trim().slice(0, 1200);

  return {
    title,
    content_type: contentType,
    intent_mode: coerceIntentMode(raw.intent_mode),
    intent_summary: String(raw.intent_summary || "").trim().slice(0, 300),
    description,
    ocr_text: String(raw.ocr_text || "").trim().slice(0, 6000),
    tags,
    entities: asArray<Record<string, unknown>>(raw.entities)
      .filter((e) => String(e?.name || "").trim())
      .slice(0, 12)
      .map((e) => ({ name: String(e.name).trim().slice(0, 80), type: String(e.type || "other") })),
    actionable: Boolean(raw.actionable),
    urgency: coerceUrgency(raw.urgency),
    confidence,
    due_on: coerceDate(raw.due_on),
    event_on: coerceDate(raw.event_on),
    suggested_actions: actions,
    event: asFacet(raw.event),
    place: asFacet(raw.place),
    person: asFacet(raw.person),
    product: asFacet(raw.product),
    answer: raw.answer ? unescapeModelText(String(raw.answer)) : null,
    citations,
    short_message:
      String(raw.short_message || "").trim().slice(0, 400) ||
      (ctx.mode === "ask" && raw.answer
        ? unescapeModelText(String(raw.answer)).slice(0, 280)
        : `Saved: ${title}`),
    agent_activity: asArray<unknown>(raw.agent_activity)
      .map((a) => String(a || "").trim())
      .filter(Boolean)
      .slice(0, 8),
  };
}

export async function analyzeScreenshot(input: {
  imageBytes: Buffer;
  mimeType: string;
  mode: "save" | "ask" | "describe";
  question?: string | null;
  userNote?: string | null;
  source?: string | null;
  capturedAt?: string | null;
  allowWebSearch?: boolean;
}): Promise<{ analysis: ScreenshotAnalysis; meta: RunMeta }> {
  const { text, meta } = await run({
    system: SCREENSHOT_SYSTEM,
    user: buildScreenshotPrompt({
      mode: input.mode,
      question: input.question,
      userNote: input.userNote,
      source: input.source,
      capturedAt: input.capturedAt,
      allowWebSearch: input.allowWebSearch,
    }),
    imageBase64: input.imageBytes.toString("base64"),
    mimeType: input.mimeType,
    tools: input.allowWebSearch ? ["webSearch", "webFetch"] : [],
    label: `screenshot:${input.mode}`,
  });

  const parsed = extractJson(text);
  if (!parsed) {
    throw new AgentError("Model did not return valid JSON for the screenshot.", "bad_json", true);
  }

  return {
    analysis: validateAnalysis(parsed, { mode: input.mode, capturedAt: input.capturedAt }),
    meta,
  };
}

/* ------------------------------------------------------------ retrieval */

export interface QueryPlan {
  semantic_query: string;
  content_types: string[] | null;
  tags: string[] | null;
  created_after: string | null;
  created_before: string | null;
  actionable: boolean | null;
  intent: "list" | "lookup" | "action";
}
// Note: there is deliberately no intent_mode filter. REMEMBER/EXPLORE/ACT is an
// internal classification that a model cannot infer from how a question is
// phrased — asking it to try made it emit ["REMEMBER"] for "what was that
// backpack I was looking at", filtering out the EXPLORE-tagged backpack that was
// the answer.

export async function planQuery(question: string): Promise<QueryPlan> {
  const cfg = getConfig();
  const today = new Date().toISOString().slice(0, 10);

  const { text } = await run({
    system: QUERY_PLANNER_SYSTEM,
    user: buildQueryPlannerPrompt(question, today),
    model: cfg.cursorSearchModel,
    label: "query-plan",
  });

  const parsed = extractJson(text) || {};
  const strings = (value: unknown) =>
    Array.isArray(value) && value.length
      ? value.map((v) => String(v)).filter(Boolean)
      : null;

  return {
    semantic_query: String(parsed.semantic_query || question).trim() || question,
    content_types: strings(parsed.content_types),
    tags: strings(parsed.tags),
    created_after: coerceDate(parsed.created_after),
    created_before: coerceDate(parsed.created_before),
    // Only ever narrow to actionable; `false` would hide everything already done.
    actionable: parsed.actionable === true ? true : null,
    intent: (["list", "lookup", "action"] as const).includes(parsed.intent as never)
      ? (parsed.intent as QueryPlan["intent"])
      : "lookup",
  };
}

export interface RelevanceVerdict {
  id: string;
  verdict: "primary" | "supporting" | "irrelevant";
  reason: string;
}

export async function judgeRelevance(
  question: string,
  candidates: Array<{ id: string; title: string; type: string; description: string; date: string }>,
): Promise<RelevanceVerdict[]> {
  if (!candidates.length) return [];
  const cfg = getConfig();

  const { text } = await run({
    system: RELEVANCE_GATE_SYSTEM,
    user: buildRelevanceGatePrompt(question, candidates),
    model: cfg.cursorSearchModel,
    label: "relevance-gate",
  });

  const parsed = extractJson(text);
  const verdicts = Array.isArray(parsed?.verdicts) ? parsed.verdicts : [];
  const valid = new Set(candidates.map((c) => c.id));

  return (verdicts as Array<Record<string, unknown>>)
    .map((v) => ({
      id: String(v.id || ""),
      verdict: (["primary", "supporting", "irrelevant"] as const).includes(v.verdict as never)
        ? (v.verdict as RelevanceVerdict["verdict"])
        : "irrelevant",
      reason: String(v.reason || "").slice(0, 200),
    }))
    .filter((v) => valid.has(v.id));
}

export interface SynthesizedAnswer {
  answer: string;
  short_message: string;
  meta: RunMeta;
}

export function splitAnswer(raw: string): { answer: string; short: string } {
  const cleaned = unescapeModelText(raw);
  const [markdown, short] = cleaned.split(/\n?---SHORT---\n?/);
  const answer = (markdown || cleaned).trim();
  const shortMessage = (short || answer.split("\n").filter(Boolean)[0] || answer).trim();
  return { answer, short: shortMessage.replace(/[*_#`]/g, "").slice(0, 400) };
}

export async function synthesizeAnswer(input: {
  question: string;
  memories: Array<Record<string, unknown>>;
  onText?: (chunk: string) => void;
}): Promise<SynthesizedAnswer> {
  const cfg = getConfig();
  const { text, meta } = await run({
    system: ANSWER_SYSTEM,
    user: buildAnswerPrompt(
      input.question,
      JSON.stringify(input.memories).slice(0, 24000),
      new Date().toISOString().slice(0, 10),
    ),
    model: cfg.cursorSearchModel,
    label: "synthesize",
    onText: input.onText,
  });

  const { answer, short } = splitAnswer(text);
  return { answer, short_message: short, meta };
}

export async function listAvailableModels() {
  const cfg = getConfig();
  return Cursor.models.list(cfg.cursorApiKey ? { apiKey: cfg.cursorApiKey } : undefined);
}
