import { getConfig } from "@/lib/config";
import { signScreenshotUrl } from "@/lib/memory/supabase-storage";

export type RagIndexResult = {
  memory_id: string;
  image_url: string | null;
  created_at: string;
  raw: Record<string, unknown>;
};

export type RagSearchHit = {
  memory_id: string;
  score: number;
  image_url: string | null;
  description: string;
  category: string;
  ocr_text: string;
  created_at: string | null;
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const obj = asRecord(payload);
  for (const key of ["results", "matches", "data", "items", "memories", "documents"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

function normalizeHit(item: unknown, index: number): RagSearchHit {
  const raw = asRecord(item);
  const nested = asRecord(raw.metadata);
  const memoryId =
    pickString(raw, ["id", "memory_id", "document_id", "external_id"]) ||
    pickString(nested, ["id", "memory_id", "external_id"]) ||
    `rag_${index}`;
  const imageUrl =
    pickString(raw, ["image_url", "imageUrl", "public_url", "url"]) ||
    pickString(nested, ["image_url", "imageUrl", "url"]) ||
    null;
  const description =
    pickString(raw, ["description", "content", "text", "searchable_text", "caption"]) ||
    pickString(nested, ["description", "searchable_text"]);
  const category = pickString(raw, ["category"]) || pickString(nested, ["category"]);
  const ocrText = pickString(raw, ["ocr_text"]) || pickString(nested, ["ocr_text"]);
  const createdAt =
    pickString(raw, ["created_at", "createdAt", "uploaded_at"]) ||
    pickString(nested, ["created_at", "uploaded_at", "captured_at"]) ||
    null;
  return {
    memory_id: memoryId,
    score: pickNumber(raw, ["score", "similarity", "distance"]),
    image_url: imageUrl,
    description,
    category,
    ocr_text: ocrText,
    created_at: createdAt,
    metadata: {
      ...raw,
      ...nested,
      external_id: pickString(raw, ["external_id"]) || nested.external_id,
      category,
      description,
      ocr_text: ocrText,
      created_at: createdAt,
      image_url: imageUrl,
    },
    raw,
  };
}

function extensionFor(contentType: string) {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "png";
}

export async function ragIndex(input: {
  externalId: string;
  imagePath?: string;
  contentType: string;
  description: string;
  ocrText?: string | null;
  category?: string | null;
  metadata: Record<string, unknown>;
}): Promise<RagIndexResult> {
  const cfg = getConfig();
  if (!cfg.memorySaveEndpoint) throw new Error("MEMORY_SAVE_ENDPOINT is not set");

  const imagePath = input.imagePath || `${input.externalId}.${extensionFor(input.contentType)}`;
  const body = {
    external_id: input.externalId,
    image_path: imagePath,
    description: input.description,
    ocr_text: input.ocrText || "",
    category: input.category || "other",
    metadata: input.metadata,
  };

  const res = await fetch(cfg.memorySaveEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(cfg.memoryHttpTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RAG index failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const payload = asRecord(await res.json());
  return {
    memory_id:
      pickString(payload, ["external_id", "memory_id", "id", "document_id"]) || input.externalId,
    image_url: pickString(payload, ["image_url", "imageUrl", "url", "public_url", "image_path"]) || imagePath,
    created_at: pickString(payload, ["created_at", "createdAt"]) || new Date().toISOString(),
    raw: payload,
  };
}

function imagePathCandidates(hit: RagSearchHit): string[] {
  const nested = asRecord(hit.metadata);
  const explicit =
    pickString(hit.raw, ["image_path", "imagePath"]) ||
    pickString(nested, ["image_path", "imagePath"]);
  const externalId =
    pickString(hit.raw, ["external_id"]) ||
    pickString(nested, ["external_id"]) ||
    hit.memory_id;
  const out: string[] = [];
  if (explicit) out.push(explicit);
  if (externalId) {
    for (const ext of ["png", "jpg", "jpeg", "webp"]) out.push(`${externalId}.${ext}`);
  }
  return [...new Set(out)];
}

async function withSignedImage(hit: RagSearchHit): Promise<RagSearchHit> {
  if (hit.image_url && /^https?:\/\//i.test(hit.image_url)) return hit;
  for (const path of imagePathCandidates(hit)) {
    const signed = await signScreenshotUrl(path);
    if (signed) return { ...hit, image_url: signed };
  }
  return hit;
}

export async function ragSearch(input: {
  query: string;
  topK?: number;
  signImages?: boolean;
}): Promise<RagSearchHit[]> {
  const cfg = getConfig();
  if (!cfg.memorySearchEndpoint) throw new Error("MEMORY_SEARCH_ENDPOINT is not set");

  const url = new URL(cfg.memorySearchEndpoint);
  url.searchParams.set("q", input.query);
  url.searchParams.set("limit", String(Math.min(8, Math.max(1, input.topK ?? 5))));

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(cfg.memoryHttpTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RAG search failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const payload = await res.json();
  const hits = extractItems(payload).map((item, index) => normalizeHit(item, index));
  if (input.signImages === false) return hits;
  return Promise.all(hits.map((hit) => withSignedImage(hit)));
}
