/** Server-side configuration for SnapAct (never expose CURSOR_API_KEY to the client). */

export function getConfig() {
  return {
    cursorApiKey: process.env.CURSOR_API_KEY?.trim() || "",
    cursorModel: process.env.CURSOR_MODEL?.trim() || "",
    useMockCursor: (process.env.USE_MOCK_CURSOR || "").toLowerCase() === "true",
    demoUserId: process.env.DEMO_USER_ID?.trim() || "demo-user",
    memorySaveEndpoint: process.env.MEMORY_SAVE_ENDPOINT?.trim() || "",
    memorySearchEndpoint: process.env.MEMORY_SEARCH_ENDPOINT?.trim() || "",
    memoryListEndpoint: process.env.MEMORY_LIST_ENDPOINT?.trim() || "",
    memoryGetEndpoint: process.env.MEMORY_GET_ENDPOINT?.trim() || "",
    memoryUpdateEndpoint: process.env.MEMORY_UPDATE_ENDPOINT?.trim() || "",
    memoryApiKey: process.env.MEMORY_API_KEY?.trim() || process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || "",
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
