/**
 * Central SnapAct ↔ Cursor SDK interface.
 * Screenshot analysis uses GPT-5.6 Luna via Cursor SDK (no direct provider APIs).
 */

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, Cursor, CursorAgentError, JsonlLocalAgentStore } from "@cursor/sdk";
import type { SDKCustomTool, SDKJsonValue } from "@cursor/sdk";
import { getConfig, cursorConfigured } from "@/lib/config";
import { getMemoryStore } from "@/lib/memory/memory-store";
import {
  FEED_REFRESH_SYSTEM,
  MEMORY_ASK_SYSTEM,
  SCREENSHOT_ANALYSIS_SYSTEM,
  buildFeedRefreshPrompt,
  buildMemoryAskPrompt,
  buildScreenshotUserPrompt,
} from "@/lib/prompts/screenshot-analysis";
import {
  MEMORY_ANALYSIS_JSON_HINT,
  type CaptureMode,
  type HomeFeedPlan,
  type MemoryAnalysis,
  type MemoryRecord,
} from "@/lib/schemas/memory";

export class SnapActAgentError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "SnapActAgentError";
  }
}

export interface AgentRunMeta {
  model: string;
  durationMs: number;
  toolsUsed: string[];
  webSearchUsed: boolean;
  requestId?: string;
}

function writableSdkRoot() {
  const root = join(tmpdir(), "snapact-sdk");
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, "agent-store"), { recursive: true });
  // Vercel lambda HOME is not writable; Cursor SDK mkdirs under ~/.cursor/...
  process.env.HOME = tmpdir();
  process.env.XDG_CACHE_HOME = join(tmpdir(), "cache");
  mkdirSync(process.env.XDG_CACHE_HOME, { recursive: true });
  return root;
}

function requireCursorConfig() {
  const cfg = getConfig();
  if (cfg.useMockCursor) return cfg;
  if (!cfg.cursorModel) {
    throw new SnapActAgentError(
      "CURSOR_MODEL is not configured. Run `npm run list-models` or set gpt-5.6-luna.",
      "missing_model",
    );
  }
  return cfg;
}

function extractJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj as Record<string, unknown>;
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fence) {
    try {
      const obj = JSON.parse(fence[1]);
      if (obj && typeof obj === "object") return obj as Record<string, unknown>;
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(trimmed.slice(start, end + 1));
      if (obj && typeof obj === "object") return obj as Record<string, unknown>;
    } catch {
      /* continue */
    }
  }
  return { answer: trimmed, description: trimmed, title: "Screenshot", searchable_text: trimmed };
}

function normalizeAnalysis(
  data: Record<string, unknown>,
  extras: {
    mode: CaptureMode;
    question?: string | null;
    userDescription?: string | null;
    source?: string | null;
    toolsUsed: string[];
    webSearchUsed: boolean;
  },
): MemoryAnalysis {
  const activity = Array.isArray(data.agent_activity)
    ? (data.agent_activity as string[])
    : [];
  const webSearchUsed =
    extras.webSearchUsed ||
    activity.some((s) => /web|research|search|external/i.test(s));

  const analysis: MemoryAnalysis = {
    title: String(data.title || "Screenshot memory"),
    content_type: (data.content_type as MemoryAnalysis["content_type"]) || "other",
    intent_mode: (data.intent_mode as MemoryAnalysis["intent_mode"]) || "REMEMBER",
    intent_summary: String(data.intent_summary || "Captured for later."),
    description: String(data.description || ""),
    searchable_text: String(data.searchable_text || data.description || data.title || ""),
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    entities: Array.isArray(data.entities) ? (data.entities as MemoryAnalysis["entities"]) : [],
    extracted_text_summary: (data.extracted_text_summary as string) || null,
    actionable: Boolean(data.actionable),
    urgency: (data.urgency as string) || "none",
    needs_live_search: Boolean(data.needs_live_search),
    confidence: Number(data.confidence ?? 0.5),
    suggested_actions: Array.isArray(data.suggested_actions)
      ? (data.suggested_actions as MemoryAnalysis["suggested_actions"])
      : [],
    temporal: (data.temporal as Record<string, unknown>) || null,
    event: (data.event as Record<string, unknown>) || null,
    person_followup: (data.person_followup as Record<string, unknown>) || null,
    place: (data.place as Record<string, unknown>) || null,
    product: (data.product as Record<string, unknown>) || null,
    answer: (data.answer as string) || null,
    user_question: extras.question || null,
    user_description: extras.userDescription || null,
    source: extras.source || null,
    citations: Array.isArray(data.citations) ? (data.citations as MemoryAnalysis["citations"]) : [],
    short_message: (data.short_message as string) || null,
    agent_activity: activity.length
      ? activity
      : ["Screenshot understood", "Metadata generated"],
    web_search_used: webSearchUsed,
    live_verification: webSearchUsed,
    live_verification_failed: Boolean(
      data.needs_live_search && !webSearchUsed,
    ),
  };

  if (extras.userDescription && !analysis.searchable_text.includes(extras.userDescription)) {
    analysis.searchable_text = `${analysis.searchable_text} User context: ${extras.userDescription}.`;
  }
  if (extras.question && !analysis.searchable_text.includes(extras.question)) {
    analysis.searchable_text = `${analysis.searchable_text} User question: ${extras.question}.`;
  }

  if (!analysis.short_message) {
    if (extras.mode === "ask" && analysis.answer) {
      analysis.short_message = analysis.answer.slice(0, 280);
    } else if (extras.mode === "save") {
      analysis.short_message = `Saved to SnapAct ✓ ${analysis.title}`;
    } else {
      analysis.short_message = `Saved: ${analysis.title}`;
    }
  }

  if (webSearchUsed && !analysis.agent_activity.some((s) => /research|search|web/i.test(s))) {
    analysis.agent_activity = [...analysis.agent_activity, "External research performed"];
  }
  if (!analysis.agent_activity.includes("Memory metadata ready")) {
    analysis.agent_activity = [...analysis.agent_activity, "Memory metadata ready"];
  }

  return analysis;
}

function mockAnalyzeScreenshot(input: {
  mode: CaptureMode;
  question?: string | null;
  userDescription?: string | null;
  source?: string | null;
}): { analysis: MemoryAnalysis; meta: AgentRunMeta } {
  const q = `${input.question || ""} ${input.userDescription || ""}`.toLowerCase();
  const wantsEvent = /event|austin|hackathon|similar/.test(q);
  const wantsPlace = /restaurant|dinner|birthday|place/.test(q) || input.mode === "describe";

  let analysis: MemoryAnalysis;
  if (wantsEvent) {
    analysis = {
      title: "AI Hackathon Austin",
      content_type: "event",
      intent_mode: "ACT",
      intent_summary: "User may want to attend or find similar events.",
      description: "Event screenshot related to an AI hackathon in Austin.",
      searchable_text:
        "AI Hackathon Austin developer event. Category: event. Intent: ACT. Location: Austin Texas.",
      tags: ["AI", "hackathon", "Austin"],
      entities: [{ name: "Austin", type: "location" }],
      actionable: true,
      urgency: "high",
      needs_live_search: true,
      confidence: 0.85,
      suggested_actions: [
        { type: "research", label: "Find similar events" },
        { type: "add_calendar", label: "Add to Calendar" },
      ],
      event: { name: "AI Hackathon Austin", location: "Austin, TX" },
      answer:
        input.mode === "ask"
          ? "I found similar AI builder events in Austin: AI Builders Austin, Agent Hack Night, and Austin ML Meetup."
          : null,
      user_question: input.question || null,
      user_description: input.userDescription || null,
      source: input.source || null,
      citations:
        input.mode === "ask"
          ? [
              {
                title: "AI Builders Austin",
                url: "https://example.com/ai-builders-austin",
                source: "web",
              },
            ]
          : [],
      short_message:
        input.mode === "ask"
          ? "I found 3 similar AI events in Austin: AI Builders Austin, Agent Hack Night, and Austin ML Meetup."
          : "Saved to SnapAct ✓ AI Hackathon Austin",
      agent_activity: [
        "Screenshot understood",
        "Event detected",
        "Intent classified as ACT",
        "Current information required",
        "External research performed",
        "Memory metadata ready",
      ],
      web_search_used: input.mode === "ask",
      live_verification: input.mode === "ask",
    };
  } else if (wantsPlace) {
    analysis = {
      title: "Restaurant candidate",
      content_type: "place",
      intent_mode: "EXPLORE",
      intent_summary: input.userDescription || "User is considering this place.",
      description: "Place screenshot enriched with user context.",
      searchable_text: `Restaurant / place screenshot. ${input.userDescription || ""} Category: place. Intent: EXPLORE.`,
      tags: ["place", "restaurant"],
      entities: [],
      actionable: true,
      urgency: "low",
      needs_live_search: false,
      confidence: 0.8,
      suggested_actions: [{ type: "research", label: "Explore" }],
      place: { category: "restaurant" },
      user_description: input.userDescription || null,
      source: input.source || null,
      citations: [],
      short_message: `Saved to SnapAct ✓ ${input.userDescription || "place"}`,
      agent_activity: [
        "Screenshot understood",
        "Place identified",
        "User description incorporated",
        "Intent classified as EXPLORE",
        "Memory metadata ready",
      ],
    };
  } else {
    analysis = {
      title: "Stay hungry, stay foolish",
      content_type: "quote",
      intent_mode: "REMEMBER",
      intent_summary: "User wants to remember this quote.",
      description: "Inspirational quote captured from a screenshot.",
      searchable_text: "Stay hungry stay foolish quote. Category: quote. Intent: REMEMBER.",
      tags: ["quote", "inspiration"],
      entities: [],
      actionable: false,
      urgency: "none",
      needs_live_search: false,
      confidence: 0.92,
      suggested_actions: [{ type: "save", label: "Saved" }],
      answer: null,
      user_question: input.question || null,
      source: input.source || null,
      citations: [],
      short_message:
        input.mode === "save"
          ? "Saved to SnapAct ✓ Stay hungry, stay foolish"
          : "Saved quote: Stay hungry, stay foolish.",
      agent_activity: [
        "Screenshot understood",
        "Quote identified",
        "Intent classified as REMEMBER",
        "Memory metadata ready",
      ],
      web_search_used: false,
    };
  }

  return {
    analysis,
    meta: {
      model: "mock",
      durationMs: 5,
      toolsUsed: analysis.web_search_used ? ["webSearch"] : [],
      webSearchUsed: Boolean(analysis.web_search_used),
    },
  };
}

async function runCursorPrompt(input: {
  system: string;
  userText: string;
  imageBase64?: string;
  mimeType?: string;
  enableMemoryTools?: boolean;
  model?: string;
  tools?: string[];
  label: string;
}): Promise<{ text: string; meta: AgentRunMeta }> {
  const cfg = requireCursorConfig();
  if (cfg.useMockCursor || !cursorConfigured()) {
    throw new SnapActAgentError("Mock cursor path should be handled by callers.", "mock");
  }

  const started = Date.now();
  const toolsUsed = new Set<string>();
  const memoryStore = getMemoryStore();

  const customTools: Record<string, SDKCustomTool> | undefined = input.enableMemoryTools
    ? {
        search_memories: {
          description: "Semantic search over the demo user's saved SnapAct memories.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              top_k: { type: "number" },
            },
            required: ["query"],
          } as Record<string, SDKJsonValue>,
          async execute(args) {
            const hits = await memoryStore.searchMemories({
              userId: cfg.demoUserId,
              query: String(args.query || ""),
              topK: Number(args.top_k || 8),
            });
            return JSON.stringify(hits);
          },
        },
        list_recent_memories: {
          description: "List recent SnapAct memories for the demo user.",
          inputSchema: {
            type: "object",
            properties: { limit: { type: "number" } },
          } as Record<string, SDKJsonValue>,
          async execute(args) {
            const items = await memoryStore.listRecent({
              userId: cfg.demoUserId,
              limit: Number(args.limit || 20),
            });
            return JSON.stringify(
              items.map((m) => ({
                memory_id: m.memory_id,
                title: m.analysis?.title || m.metadata.title,
                content_type: m.analysis?.content_type || m.metadata.content_type,
                intent_mode: m.analysis?.intent_mode || m.metadata.intent_mode,
              })),
            );
          },
        },
        get_memory: {
          description: "Fetch one SnapAct memory by id.",
          inputSchema: {
            type: "object",
            properties: { memory_id: { type: "string" } },
            required: ["memory_id"],
          } as Record<string, SDKJsonValue>,
          async execute(args) {
            const mem = await memoryStore.getMemory({
              userId: cfg.demoUserId,
              memoryId: String(args.memory_id || ""),
            });
            return mem ? JSON.stringify(mem) : "Memory not found";
          },
        },
      }
    : undefined;

  const modelId = input.model || cfg.cursorModel;
  console.info(
    `[snapact-agent] start label=${input.label} model=${modelId} image=${Boolean(input.imageBase64)}`,
  );

  try {
    await using agent = await Agent.create({
      ...(cfg.cursorApiKey ? { apiKey: cfg.cursorApiKey } : {}),
      model: { id: modelId },
      local: {
        cwd: writableSdkRoot(),
        store: new JsonlLocalAgentStore(join(writableSdkRoot(), "agent-store")),
        settingSources: [],
        customTools,
      },
      // Built-in webSearch / webFetch are available through Cursor for live info.
      // Restrict filesystem mutation tools for API safety.
      tools: input.tools ?? ["webSearch", "webFetch", "mcp", "read"],
      disallowedTools: ["shell", "edit", "delete", "generateImage"],
    });

    const message = input.imageBase64
      ? {
          text: `${input.system}\n\n${input.userText}\n\n${MEMORY_ANALYSIS_JSON_HINT}`,
          images: [
            {
              data: input.imageBase64,
              mimeType: input.mimeType || "image/png",
            },
          ],
        }
      : `${input.system}\n\n${input.userText}`;

    const run = await agent.send(message);
    console.info(`[snapact-agent] run_id=${run.id} agent_id=${agent.agentId}`);

    for await (const event of run.stream()) {
      if (event.type === "tool_call" && event.name) {
        toolsUsed.add(String(event.name));
      }
    }

    const result = await run.wait();
    const durationMs = Date.now() - started;

    if (result.status === "error") {
      throw new SnapActAgentError(
        result.error?.message || "Cursor agent run failed.",
        result.error?.code || "run_error",
      );
    }

    const text = result.result || "";
    const webSearchUsed = [...toolsUsed].some((t) =>
      /websearch|web_search|webfetch|web_fetch/i.test(t),
    );

    console.info(
      `[snapact-agent] done label=${input.label} duration_ms=${durationMs} tools=${[...toolsUsed].join(",") || "none"}`,
    );

    return {
      text,
      meta: {
        model: modelId,
        durationMs,
        toolsUsed: [...toolsUsed],
        webSearchUsed,
        requestId: run.requestId || run.id,
      },
    };
  } catch (err) {
    if (err instanceof SnapActAgentError) throw err;
    if (err instanceof CursorAgentError) {
      throw new SnapActAgentError(
        err.message || "Cursor SDK authentication/config failure.",
        "cursor_startup",
        Boolean(err.isRetryable),
      );
    }
    throw new SnapActAgentError(
      err instanceof Error ? err.message : "Unknown Cursor agent failure.",
      "unknown",
    );
  }
}

export async function analyzeScreenshot(input: {
  imageBytes: Buffer;
  mimeType: string;
  mode: CaptureMode;
  question?: string | null;
  userDescription?: string | null;
  source?: string | null;
  capturedAt?: string | null;
}): Promise<{ analysis: MemoryAnalysis; meta: AgentRunMeta }> {
  const cfg = getConfig();
  if (cfg.useMockCursor) {
    return mockAnalyzeScreenshot(input);
  }

  const userText = buildScreenshotUserPrompt({
    mode: input.mode,
    question: input.question,
    userDescription: input.userDescription,
    source: input.source,
    capturedAt: input.capturedAt,
  });

  try {
    const { text, meta } = await runCursorPrompt({
      system: SCREENSHOT_ANALYSIS_SYSTEM,
      userText,
      imageBase64: input.imageBytes.toString("base64"),
      mimeType: input.mimeType,
      enableMemoryTools: false,
      label: `capture:${input.mode}`,
    });
    const data = extractJsonObject(text);
    const analysis = normalizeAnalysis(data, {
      mode: input.mode,
      question: input.question,
      userDescription: input.userDescription,
      source: input.source,
      toolsUsed: meta.toolsUsed,
      webSearchUsed: meta.webSearchUsed,
    });
    if (analysis.needs_live_search && !meta.webSearchUsed) {
      analysis.live_verification_failed = true;
      if (!analysis.agent_activity.some((s) => /unavailable|failed/i.test(s))) {
        analysis.agent_activity = [
          ...analysis.agent_activity,
          "Live verification temporarily unavailable",
        ];
      }
    }
    return { analysis, meta };
  } catch (err) {
    // Graceful degradation: keep capture flow alive.
    const fallback = mockAnalyzeScreenshot(input);
    fallback.analysis.agent_activity = [
      "Screenshot received",
      "Cursor analysis unavailable — used fallback metadata",
    ];
    fallback.analysis.short_message =
      err instanceof Error
        ? `Screenshot saved with limited analysis. ${err.message}`
        : "Screenshot saved with limited analysis.";
    fallback.analysis.confidence = 0.25;
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
      fallbackAnalysis: fallback.analysis,
    });
  }
}

export async function askAboutScreenshot(input: {
  imageBytes: Buffer;
  mimeType: string;
  question: string;
  source?: string | null;
  capturedAt?: string | null;
}) {
  return analyzeScreenshot({
    ...input,
    mode: "ask",
    question: input.question,
  });
}

export async function analyzeSavedMemories(input: {
  question: string;
  memories: Array<Record<string, unknown>>;
}): Promise<{
  answer: string;
  short_message: string;
  citations: MemoryAnalysis["citations"];
  referenced_memory_ids: string[];
  agent_activity: string[];
  meta: AgentRunMeta;
}> {
  const cfg = getConfig();
  if (cfg.useMockCursor) {
    const titles = input.memories
      .slice(0, 3)
      .map((m) => m.title || m.memory_id)
      .filter(Boolean);
    const answer = titles.length
      ? `Based on your saved screenshots for “${input.question}”: ${titles.join(", ")}.`
      : `I don't have matching memories yet for “${input.question}”.`;
    return {
      answer,
      short_message: answer,
      citations: [],
      referenced_memory_ids: input.memories
        .map((m) => String(m.memory_id || ""))
        .filter(Boolean),
      agent_activity: ["Retrieved memories", "Synthesized answer"],
      meta: { model: "mock", durationMs: 1, toolsUsed: [], webSearchUsed: false },
    };
  }

  const { text, meta } = await runCursorPrompt({
    system: MEMORY_ASK_SYSTEM,
    userText: buildMemoryAskPrompt(input.question, JSON.stringify(input.memories).slice(0, 24000)),
    enableMemoryTools: false,
    model: cfg.cursorSearchModel,
    tools: [],
    label: "ask-across-memories",
  });
  const data = extractJsonObject(text);
  return {
    answer: String(data.answer || text),
    short_message: String(data.short_message || data.answer || text).slice(0, 280),
    citations: Array.isArray(data.citations)
      ? (data.citations as MemoryAnalysis["citations"])
      : [],
    referenced_memory_ids: Array.isArray(data.referenced_memory_ids)
      ? (data.referenced_memory_ids as string[])
      : [],
    agent_activity: Array.isArray(data.agent_activity)
      ? (data.agent_activity as string[])
      : ["Retrieved memories", "Synthesized answer"],
    meta,
  };
}

export async function generateHomeIntelligence(input: {
  memories: MemoryRecord[];
  rankedHints: Array<Record<string, unknown>>;
}): Promise<Partial<HomeFeedPlan> & { meta?: AgentRunMeta }> {
  const cfg = getConfig();
  if (cfg.useMockCursor) {
    return {
      needs_attention: input.rankedHints.filter((h) => h.bucket === "needs_attention") as never,
      upcoming_events: input.rankedHints.filter((h) => h.bucket === "upcoming_events") as never,
      follow_ups: input.rankedHints.filter((h) => h.bucket === "follow_ups") as never,
      suggested_explorations: input.rankedHints.filter(
        (h) => h.bucket === "suggested_explorations",
      ) as never,
      meta: { model: "mock", durationMs: 1, toolsUsed: [], webSearchUsed: false },
    };
  }

  const compact = input.memories.slice(0, 40).map((m) => ({
    memory_id: m.memory_id,
    title: m.analysis?.title || m.metadata.title,
    content_type: m.analysis?.content_type || m.metadata.content_type,
    intent_mode: m.analysis?.intent_mode || m.metadata.intent_mode,
    urgency: m.analysis?.urgency || m.metadata.urgency,
    actionable: m.analysis?.actionable || m.metadata.actionable,
    completed: m.completed,
    description: m.analysis?.description || m.metadata.description,
  }));

  const { text, meta } = await runCursorPrompt({
    system: FEED_REFRESH_SYSTEM,
    userText: buildFeedRefreshPrompt(
      JSON.stringify(compact).slice(0, 20000),
      JSON.stringify(input.rankedHints).slice(0, 8000),
    ),
    enableMemoryTools: false,
    label: "home-intelligence",
  });
  const data = extractJsonObject(text);
  return { ...data, meta } as Partial<HomeFeedPlan> & { meta: AgentRunMeta };
}

export async function listAvailableModels() {
  const cfg = getConfig();
  return Cursor.models.list(cfg.cursorApiKey ? { apiKey: cfg.cursorApiKey } : undefined);
}

export { cursorConfigured };
