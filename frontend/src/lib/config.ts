/** Server-side configuration for SnapAct (never expose CURSOR_API_KEY to the client). */

function httpUrl(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? raw : "";
  } catch {
    return "";
  }
}

export function getConfig() {
  return {
    cursorApiKey: process.env.CURSOR_API_KEY?.trim() || "",
    cursorModel: process.env.CURSOR_MODEL?.trim() || "gpt-5.6-luna",
    cursorSearchModel: process.env.CURSOR_SEARCH_MODEL?.trim() || "composer-2.5",
    useMockCursor: (process.env.USE_MOCK_CURSOR || "").toLowerCase() === "true",
    demoUserId: process.env.DEMO_USER_ID?.trim() || "demo-user",
    memorySaveEndpoint: httpUrl(process.env.MEMORY_SAVE_ENDPOINT),
    memorySearchEndpoint: httpUrl(process.env.MEMORY_SEARCH_ENDPOINT),
    memoryListEndpoint: httpUrl(process.env.MEMORY_LIST_ENDPOINT),
    memoryGetEndpoint: httpUrl(process.env.MEMORY_GET_ENDPOINT),
    memoryUpdateEndpoint: httpUrl(process.env.MEMORY_UPDATE_ENDPOINT),
    memoryApiKey: process.env.MEMORY_API_KEY?.trim() || process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "",
    supabaseUrl: httpUrl(process.env.SUPABASE_URL),
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "",
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() || "",
    supabaseBucket: process.env.SUPABASE_BUCKET?.trim() || "screenshots",
    memoryHttpTimeoutMs: Number(process.env.MEMORY_HTTP_TIMEOUT_MS || 30000),
    maxImageBytes: Number(process.env.MAX_IMAGE_BYTES || 12 * 1024 * 1024),
  };
}

export function cursorConfigured(): boolean {
  const c = getConfig();
  // Model id is required; API key may come from CURSOR_API_KEY or ~/.cursor/sdk/auth.json
  return c.useMockCursor || Boolean(c.cursorModel);
}

export function usingRemoteMemory(): boolean {
  const c = getConfig();
  return Boolean(c.memorySaveEndpoint && c.memorySearchEndpoint);
}
