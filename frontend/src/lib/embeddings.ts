/**
 * Embeddings via the `embed` Supabase Edge Function (gte-small, 384 dims).
 *
 * Self-hosted alongside the database: no third-party embedding vendor, no extra
 * API key, no per-token cost, and the vector dimensionality is guaranteed to
 * match the `memories.embedding` column.
 */

import { assertStorageConfigured } from "@/lib/config";

export const EMBEDDING_DIMENSIONS = 384;

function normalizeInput(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 8000);
}

async function callEmbedFunction(inputs: string[]): Promise<number[][]> {
  const cfg = assertStorageConfigured();
  const res = await fetch(`${cfg.supabaseUrl.replace(/\/$/, "")}/functions/v1/embed`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.supabaseSecretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: inputs }),
    signal: AbortSignal.timeout(cfg.httpTimeoutMs),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Embedding request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const payload = (await res.json()) as { embeddings?: number[][]; dimensions?: number };
  const embeddings = payload.embeddings;
  if (!Array.isArray(embeddings) || !embeddings.length) {
    throw new Error("Embedding response contained no vectors");
  }
  if (embeddings[0].length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: got ${embeddings[0].length}, expected ${EMBEDDING_DIMENSIONS}`,
    );
  }
  return embeddings;
}

/** Embed one string. Returns null for empty input rather than a zero vector. */
export async function embed(text: string): Promise<number[] | null> {
  const input = normalizeInput(text);
  if (!input) return null;
  const [vector] = await callEmbedFunction([input]);
  return vector ?? null;
}

/** Embed many strings, preserving order. Empty inputs come back as null. */
export async function embedBatch(texts: string[]): Promise<Array<number[] | null>> {
  const normalized = texts.map(normalizeInput);
  const populated = normalized
    .map((text, index) => ({ text, index }))
    .filter((item) => item.text.length > 0);

  if (!populated.length) return normalized.map(() => null);

  const out: Array<number[] | null> = normalized.map(() => null);
  const BATCH = 32;
  for (let start = 0; start < populated.length; start += BATCH) {
    const chunk = populated.slice(start, start + BATCH);
    const vectors = await callEmbedFunction(chunk.map((item) => item.text));
    chunk.forEach((item, offset) => {
      out[item.index] = vectors[offset] ?? null;
    });
  }
  return out;
}
