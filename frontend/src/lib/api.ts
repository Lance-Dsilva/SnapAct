import type {
  AskResponse,
  CaptureResponse,
  Digest,
  HealthResponse,
  Memory,
  MemoryList,
  RetrievedMemory,
  SearchResponse,
} from "@/types";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

function url(path: string) {
  return `${API_BASE}${path}`;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.error || body.detail || message;
    } catch {
      /* keep the status-based message */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function getApiBase() {
  return API_BASE || "(same-origin)";
}

export async function fetchHealth() {
  return handle<HealthResponse>(await fetch(url("/api/health"), { cache: "no-store" }));
}

export async function fetchDigest() {
  return handle<Digest>(await fetch(url("/api/digest"), { cache: "no-store" }));
}

export async function listMemories(options?: {
  contentType?: string;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (options?.contentType && options.contentType !== "all") {
    params.set("content_type", options.contentType);
  }
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return handle<MemoryList>(
    await fetch(url(`/api/memories${qs ? `?${qs}` : ""}`), { cache: "no-store" }),
  );
}

export async function getMemory(id: string) {
  return handle<Memory>(await fetch(url(`/api/memories/${id}`), { cache: "no-store" }));
}

export async function updateMemory(id: string, patch: Record<string, unknown>) {
  return handle<Memory>(
    await fetch(url(`/api/memories/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteMemory(id: string) {
  return handle<{ deleted: boolean; id: string }>(
    await fetch(url(`/api/memories/${id}`), { method: "DELETE" }),
  );
}

export async function setMemoryCompleted(id: string, completed: boolean) {
  return handle<Memory>(
    await fetch(url(`/api/memories/${id}/complete`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    }),
  );
}

export async function searchMemories(query: string, limit = 20) {
  return handle<SearchResponse>(
    await fetch(url(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`), {
      cache: "no-store",
    }),
  );
}

export async function askSnapAct(question: string) {
  return handle<AskResponse>(
    await fetch(url("/api/ask"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),
  );
}

export async function streamAsk(
  question: string,
  handlers: {
    onStatus?: (text: string) => void;
    onMemories?: (memories: RetrievedMemory[], considered: number, rejected: number) => void;
    onText?: (text: string) => void;
  },
): Promise<AskResponse> {
  const res = await fetch(url("/api/ask"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ question, stream: true }),
  });
  if (!res.ok || !res.body) return handle<AskResponse>(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: AskResponse = { answer: "", memories: [] };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      switch (event.type) {
        case "status":
          handlers.onStatus?.(String(event.text || ""));
          break;
        case "memories": {
          const memories = (event.memories || []) as RetrievedMemory[];
          final.memories = memories;
          handlers.onMemories?.(
            memories,
            Number(event.considered || 0),
            Number(event.rejected || 0),
          );
          break;
        }
        case "delta":
          handlers.onText?.(String(event.text || ""));
          final.answer = String(event.text || "");
          break;
        case "done":
          final = {
            answer: String(event.answer || final.answer),
            short_message: event.short_message ? String(event.short_message) : undefined,
            memories: (event.memories as RetrievedMemory[]) || final.memories,
          };
          break;
        case "error":
          throw new Error(String(event.error || "Ask failed"));
      }
    }
  }
  return final;
}

export async function captureScreenshot(params: {
  file: File;
  mode: "save" | "ask" | "describe";
  question?: string;
  note?: string;
  onPhase?: (phase: string) => void;
}) {
  const { file, mode, question, note, onPhase } = params;

  const form = new FormData();
  form.append("image", file);
  form.append("mode", mode);
  form.append("source", "web");
  form.append("captured_at", new Date().toISOString());
  form.append("client_request_id", crypto.randomUUID());
  if (question) form.append("question", question);
  if (note) form.append("user_note", note);

  // Analysis is synchronous, so the phases reflect what the server is actually doing.
  const phases: Array<[number, string]> = [
    [0, "Uploading screenshot"],
    [900, "Reading the screenshot"],
    [3500, "Working out what it is"],
    [7000, "Filing it away"],
  ];
  const timers = phases.map(([delay, label]) =>
    window.setTimeout(() => onPhase?.(label), delay),
  );

  try {
    const res = await fetch(url("/api/capture"), { method: "POST", body: form });
    const data = await handle<CaptureResponse>(res);
    onPhase?.("Done");
    return data;
  } finally {
    timers.forEach((t) => window.clearTimeout(t));
  }
}

/** Poll a memory until background analysis lands (or we give up). */
export async function waitForReady(
  id: string,
  opts?: { timeoutMs?: number; onTick?: (status: string) => void },
): Promise<Memory> {
  const timeout = opts?.timeoutMs ?? 45000;
  const deadline = Date.now() + timeout;
  let delay = 1200;
  let latest = await getMemory(id);

  while (latest.status === "pending" && Date.now() < deadline) {
    opts?.onTick?.(latest.status);
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.35, 4000);
    latest = await getMemory(id);
  }
  return latest;
}

export async function fetchStalledCount() {
  const data = await handle<{ stalled: number }>(
    await fetch(url("/api/memories/repair"), { cache: "no-store" }),
  );
  return data.stalled;
}

export async function repairStalled(limit = 5) {
  return handle<{ repaired: number; failed: number; remaining: number }>(
    await fetch(url("/api/memories/repair"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    }),
  );
}
