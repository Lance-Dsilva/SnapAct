import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertStorageConfigured } from "@/lib/config";

let client: SupabaseClient | null = null;

/**
 * Service-role client. Server-only: the secret key bypasses RLS, so this module
 * must never be imported from a client component.
 */
export function db(): SupabaseClient {
  if (client) return client;
  const cfg = assertStorageConfigured();
  client = createClient(cfg.supabaseUrl, cfg.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "snapact" } },
  });
  return client;
}
