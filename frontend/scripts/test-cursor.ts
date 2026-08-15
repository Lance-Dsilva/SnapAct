/**
 * Tiny Cursor SDK auth + model smoke test.
 *
 * Usage:
 *   cd frontend
 *   CURSOR_API_KEY=... CURSOR_MODEL=... npx tsx scripts/test-cursor.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), "../.env") });

async function main() {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  const model = process.env.CURSOR_MODEL?.trim();
  const status = await Cursor.auth.status();
  console.log("auth status:", status.status);

  if (!apiKey && status.status !== "logged-in") {
    console.error("Missing CURSOR_API_KEY and no stored SDK login. Run: npm run cursor-login");
    process.exit(1);
  }
  if (!model) {
    console.error("Missing CURSOR_MODEL — run npm run list-models first");
    process.exit(1);
  }

  console.log(`Using model: ${model}`);
  console.log("Sending prompt...");

  try {
    const result = await Agent.prompt(
      "Respond with exactly:\nSNAPACT GROK WORKING",
      {
        ...(apiKey ? { apiKey } : {}),
        model: { id: model },
        local: { cwd: process.cwd(), settingSources: [] },
      },
    );

    console.log("status:", result.status);
    console.log("result:", result.result);
    console.log("durationMs:", result.durationMs);

    if (result.status !== "finished") {
      console.error("Run did not finish cleanly:", result.error);
      process.exit(2);
    }

    if (!result.result?.includes("SNAPACT GROK WORKING")) {
      console.warn("Response did not contain exact expected phrase, but run finished.");
    } else {
      console.log("OK — SNAPACT GROK WORKING");
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      console.error("Cursor startup failure:", err.message, "retryable=", err.isRetryable);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
