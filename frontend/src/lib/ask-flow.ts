import { analyzeSavedMemories, parseAskOutput, unescapeModelText } from "@/lib/agents/snapact-agent";
import { getConfig } from "@/lib/config";
import { getMemoryStore } from "@/lib/memory/memory-store";

export type AskMemory = {
  memory_id: string;
  title: string;
  description: string;
  image_url: string | null;
  content_type: string;
  intent_mode: string;
  score: number;
  tags: string[];
  metadata: Record<string, unknown>;
};

export async function retrieveAskMemories(
  question: string,
  topK = 8,
  opts?: { requireImage?: boolean; signImages?: boolean },
): Promise<AskMemory[]> {
  const cfg = getConfig();
  const store = getMemoryStore();
  const hits = await store.searchMemories({
    userId: cfg.demoUserId,
    query: question,
    topK,
    requireImage: opts?.requireImage,
    signImages: opts?.signImages,
  });
  return hits.map((hit) => {
    const meta = hit.metadata || {};
    const analysis = hit.analysis;
    return {
      memory_id: hit.memory_id,
      title: String(analysis?.title || meta.title || hit.memory_id),
      description: String(analysis?.description || meta.description || ""),
      image_url: hit.image_url ?? null,
      content_type: String(analysis?.content_type || meta.content_type || "other"),
      intent_mode: String(analysis?.intent_mode || meta.intent_mode || "REMEMBER"),
      score: hit.score,
      tags: (analysis?.tags || meta.tags || []) as string[],
      metadata: meta,
    };
  });
}

export function visibleAskMarkdown(raw: string) {
  const cleaned = unescapeModelText(raw);
  const cut = cleaned.split(/\n---SHORT---/)[0];
  if (cut.trim().startsWith("{")) {
    try {
      const obj = JSON.parse(cut);
      if (obj && typeof obj.answer === "string") return unescapeModelText(obj.answer);
    } catch {
      /* still streaming */
    }
  }
  return cut;
}

export function formatAskFromMemories(question: string, memories: AskMemory[]) {
  if (!memories.length) {
    const answer = `I could not find matching screenshots for “${question}”.`;
    return {
      answer,
      short_message: answer,
      citations: [] as unknown[],
      agent_activity: ["Retrieved memories"],
    };
  }
  const lines = memories.slice(0, 5).map((m, i) => {
    const event = (m.metadata.event || m.metadata.analysis && (m.metadata.analysis as { event?: Record<string, string> }).event) as
      | Record<string, string>
      | undefined;
    const when = event?.date || "";
    const where = event?.location || "";
    const extra = [when, where].filter(Boolean).join(" · ");
    const blurb = extra || (m.description || "").split(/(?<=[.!?])\s/)[0] || "";
    return `${i + 1}. **${m.title}**${blurb ? ` — ${blurb}` : ""}`;
  });
  const answer = `From your saved screenshots for “${question}”:\n\n${lines.join("\n")}`;
  const short = memories
    .slice(0, 2)
    .map((m) => m.title)
    .join("; ");
  return {
    answer,
    short_message: short.slice(0, 280),
    citations: [] as unknown[],
    agent_activity: ["Retrieved memories", "Formatted without a model for speed"],
  };
}

export async function synthesizeAsk(input: {
  question: string;
  memories: AskMemory[];
  onText?: (chunk: string) => void;
}) {
  try {
    return await analyzeSavedMemories({
      question: input.question,
      memories: input.memories.map((m) => ({
        memory_id: m.memory_id,
        title: m.title,
        description: m.description,
        content_type: m.content_type,
        intent_mode: m.intent_mode,
        tags: m.tags,
        score: m.score,
      })),
      onText: input.onText,
    });
  } catch (err) {
    console.warn("[ask] synthesis failed; returning search hits", err);
    const titles = input.memories.map((m) => m.title).filter(Boolean);
    const answer = titles.length
      ? `I found ${input.memories.length} related screenshot(s):\n\n${titles
          .map((t, i) => `${i + 1}. **${t}**`)
          .join("\n")}`
      : `I could not find matching screenshots for “${input.question}”.`;
    input.onText?.(answer);
    return {
      ...parseAskOutput(answer),
      answer,
      short_message: titles.slice(0, 2).join("; ") || answer.slice(0, 280),
      citations: [],
      agent_activity: ["Retrieved memories", "Model unavailable; listed search results"],
    };
  }
}
