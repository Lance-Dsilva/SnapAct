import type {
  AskResponse,
  CaptureResponse,
  HomeFeedPlan,
  MemoryDetail,
  SearchResultItem,
} from "@/types";

/** Same-origin Next.js API routes (no FastAPI required). */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

function url(path: string) {
  return `${API_BASE}${path}`;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

export function getApiBase() {
  return API_BASE || "(same-origin)";
}

export async function fetchHealth() {
  const res = await fetch(url("/api/health"), { cache: "no-store" });
  return handle<{
    status: string;
    cursor_configured: boolean;
    memory_store_configured: boolean;
    using_remote_memory: boolean;
  }>(res);
}

export async function listMemories(contentType?: string) {
  const qs = contentType && contentType !== "all" ? `?content_type=${contentType}` : "";
  const res = await fetch(url(`/api/memories${qs}`), { cache: "no-store" });
  return handle<{ memories: MemoryDetail[]; source: string }>(res);
}

export async function getMemory(id: string) {
  const res = await fetch(url(`/api/memories/${id}`), { cache: "no-store" });
  return handle<MemoryDetail>(res);
}

export async function searchMemories(query: string, topK = 8) {
  const res = await fetch(url("/api/search"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK, filters: {} }),
  });
  return handle<{ query: string; results: SearchResultItem[] }>(res);
}

export async function askSnapAct(question: string) {
  const res = await fetch(url("/api/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return handle<AskResponse>(res);
}

export async function streamAskSnapAct(
  question: string,
  handlers: {
    onMemories?: (memories: SearchResultItem[]) => void;
    onText?: (text: string) => void;
  },
): Promise<AskResponse> {
  const res = await fetch(url("/api/ask"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ question, stream: true }),
  });
  if (!res.ok || !res.body) {
    return handle<AskResponse>(res);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalAnswer: AskResponse = { answer: "", memories: [], citations: [] };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(6)) as {
          type: string;
          memories?: SearchResultItem[];
          text?: string;
          answer?: string;
          short_message?: string;
          citations?: AskResponse["citations"];
          detail?: string;
        };
        if (event.type === "memories" && event.memories) {
          handlers.onMemories?.(event.memories);
          finalAnswer.memories = event.memories;
        } else if (event.type === "delta" && event.text) {
          handlers.onText?.(event.text);
          finalAnswer.answer = event.text;
        } else if (event.type === "done") {
          finalAnswer = {
            answer: event.answer || finalAnswer.answer,
            memories: event.memories || finalAnswer.memories,
            citations: event.citations || [],
            short_message: event.short_message,
          };
        } else if (event.type === "error") {
          throw new Error(event.detail || "Ask failed");
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
  return finalAnswer;
}

export async function refreshIntelligence() {
  const res = await fetch(url("/api/intelligence/refresh"), { method: "POST" });
  return handle<HomeFeedPlan>(res);
}

export async function captureScreenshot(params: {
  file: File;
  mode: "save" | "ask" | "describe";
  question?: string;
  userDescription?: string;
  onPhase?: (phase: string) => void;
}) {
  const { file, mode, question, userDescription, onPhase } = params;
  onPhase?.("Understanding screenshot...");
  const form = new FormData();
  form.append("image", file);
  form.append("mode", mode);
  form.append("source", "web");
  form.append("captured_at", new Date().toISOString());
  form.append("client_request_id", crypto.randomUUID());
  if (mode === "ask" && question) form.append("question", question);
  if (mode === "describe" && userDescription) {
    form.append("user_description", userDescription);
  }

  const timers: number[] = [];
  timers.push(
    window.setTimeout(() => onPhase?.("Checking whether current information is needed..."), 900),
  );
  timers.push(window.setTimeout(() => onPhase?.("Organizing memory..."), 2200));
  timers.push(window.setTimeout(() => onPhase?.("Saving to SnapAct..."), 3500));

  try {
    const res = await fetch(url("/api/capture"), { method: "POST", body: form });
    const data = await handle<CaptureResponse>(res);
    const activity = Array.isArray(data.agent_activity)
      ? data.agent_activity
      : data.agent_activity?.steps || [];
    if (activity.some((s) => /research|search|web/i.test(s))) {
      onPhase?.("Searching current sources...");
    }
    onPhase?.("Done");
    return data;
  } finally {
    timers.forEach((t) => window.clearTimeout(t));
  }
}

export async function completeMemory(id: string) {
  const res = await fetch(url(`/api/memories/${id}/complete`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true }),
  });
  return handle<MemoryDetail>(res);
}
