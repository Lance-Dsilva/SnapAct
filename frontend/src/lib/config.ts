/** Server-side configuration for SnapAct (never expose secrets to the client). */

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
    // Cursor SDK — screenshot understanding and answer synthesis.
    cursorApiKey: process.env.CURSOR_API_KEY?.trim() || "",
    cursorModel: process.env.CURSOR_MODEL?.trim() || "gpt-5.6-luna",
    cursorSearchModel: process.env.CURSOR_SEARCH_MODEL?.trim() || "composer-2.5",
    useMockCursor: (process.env.USE_MOCK_CURSOR || "").toLowerCase() === "true",

    // Supabase — the system of record. SnapAct owns this database directly.
    supabaseUrl: httpUrl(process.env.SUPABASE_URL),
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() || "",
    supabaseBucket: process.env.SUPABASE_BUCKET?.trim() || "screenshots",

    demoUserId: process.env.DEMO_USER_ID?.trim() || "demo-user",
    httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 30000),
    // Vercel hard-rejects request bodies over ~4.5MB; see PLATFORM_BODY_LIMIT_BYTES.
    maxImageBytes: Number(process.env.MAX_IMAGE_BYTES || 4 * 1024 * 1024),
    signedUrlTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS || 60 * 60 * 24),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;

export function cursorConfigured(): boolean {
  const c = getConfig();
  return c.useMockCursor || Boolean(c.cursorModel);
}

/** Supabase is required — there is no silent in-memory fallback any more. */
export function assertStorageConfigured() {
  const c = getConfig();
  if (!c.supabaseUrl || !c.supabaseSecretKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SECRET_KEY are required. SnapAct stores memories in Supabase.",
    );
  }
  return c;
}
