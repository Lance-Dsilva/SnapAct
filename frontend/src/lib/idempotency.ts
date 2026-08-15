type CacheEntry = { ts: number; payload: unknown };

function cache(): Map<string, CacheEntry> {
  const g = globalThis as typeof globalThis & { __snapactIdem?: Map<string, CacheEntry> };
  if (!g.__snapactIdem) g.__snapactIdem = new Map();
  return g.__snapactIdem;
}

const TTL_MS = 6 * 60 * 60 * 1000;

export function getIdempotent(clientRequestId?: string | null) {
  if (!clientRequestId) return null;
  const item = cache().get(clientRequestId);
  if (!item) return null;
  if (Date.now() - item.ts > TTL_MS) {
    cache().delete(clientRequestId);
    return null;
  }
  return item.payload;
}

export function setIdempotent(clientRequestId: string | null | undefined, payload: unknown) {
  if (!clientRequestId) return;
  cache().set(clientRequestId, { ts: Date.now(), payload });
}
