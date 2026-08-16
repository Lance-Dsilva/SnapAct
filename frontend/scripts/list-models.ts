/**
 * List model IDs available to the current CURSOR_API_KEY account.
 *
 * Usage:
 *   cd frontend
 *   CURSOR_API_KEY=... npx tsx scripts/list-models.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { Cursor, CursorAgentError } from "@cursor/sdk";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../.env") });

async function main() {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  const status = await Cursor.auth.status();
  console.log("auth status:", status.status, status.status === "logged-in" ? status.email || "" : "");

  if (!apiKey && status.status !== "logged-in") {
    console.error("Missing CURSOR_API_KEY and no stored SDK login.");
    console.error("Run: npm run cursor-login");
    process.exit(1);
  }

  try {
    const models = await Cursor.models.list(apiKey ? { apiKey } : undefined);
    console.log(`Found ${models.length} models:\n`);
    for (const m of models) {
      const params = (m.parameters || [])
        .map((p) => p.id)
        .filter(Boolean)
        .join(", ");
      console.log(`- ${m.id}${m.displayName ? `  (${m.displayName})` : ""}${params ? `  params: ${params}` : ""}`);
      for (const v of m.variants || []) {
        console.log(`    variant: ${v.displayName}${v.isDefault ? " (default)" : ""}`);
      }
    }
    console.log("\nSet CURSOR_MODEL in frontend/.env.local (default gpt-5.6-luna).");
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error("Failed to list models:", err.message);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
