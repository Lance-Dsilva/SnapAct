/**
 * Mint/store a Cursor SDK API key via browser login.
 * Usage: cd frontend && npx tsx scripts/cursor-login.ts
 */
import { Cursor } from "@cursor/sdk";

async function main() {
  const status = await Cursor.auth.status();
  console.log("auth status:", status.status);
  if (status.status === "logged-in") {
    console.log("Already logged in.", status.email ? `email=${status.email}` : "");
    console.log("You can still re-login if the stored key is stale.");
  }

  console.log("Opening Cursor login in the browser...");
  const result = await Cursor.auth.login({
    apiKeyName: "SnapAct hackathon",
  });
  console.log("Logged in.", result.email ? `email=${result.email}` : "");
  console.log("API key minted and stored in ~/.cursor/sdk/auth.json");
  console.log("Put the same key in frontend/.env.local as CURSOR_API_KEY if you want it explicit.");
  console.log("Next: npm run list-models");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
