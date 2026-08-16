/**
 * API-level tests using mock Cursor (no live key required).
 * Run: cd frontend && USE_MOCK_CURSOR=true npx tsx scripts/test-api-mock.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { analyzeScreenshot, analyzeSavedMemories } from "../src/lib/agents/snapact-agent";
import { resetMemoryStoreForTests, getMemoryStore } from "../src/lib/memory/memory-store";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
process.env.USE_MOCK_CURSOR = "true";
process.env.DEMO_USER_ID = process.env.DEMO_USER_ID || "demo-user";

function png(): Buffer {
  // Minimal 1x1 PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

async function main() {
  resetMemoryStoreForTests();
  const store = getMemoryStore();
  let failed = 0;

  function assert(cond: boolean, msg: string) {
    if (!cond) {
      console.error("FAIL:", msg);
      failed += 1;
    } else {
      console.log("PASS:", msg);
    }
  }

  const quote = await analyzeScreenshot({
    imageBytes: png(),
    mimeType: "image/png",
    mode: "save",
  });
  assert(quote.analysis.intent_mode === "REMEMBER", "save → REMEMBER");
  assert(quote.analysis.content_type === "other", "save default content_type");

  const event = await analyzeScreenshot({
    imageBytes: png(),
    mimeType: "image/png",
    mode: "ask",
    question: "Are there similar events in Austin?",
  });
  assert(event.analysis.intent_mode === "ACT", "event ask → ACT");
  assert(Boolean(event.analysis.answer), "ask returns answer");

  const describe = await analyzeScreenshot({
    imageBytes: png(),
    mimeType: "image/png",
    mode: "describe",
    userDescription: "Potential restaurant for birthday dinner",
  });
  assert(
    describe.analysis.searchable_text.toLowerCase().includes("birthday"),
    "describe includes user description in searchable_text",
  );

  const later = await analyzeScreenshot({
    imageBytes: png(),
    mimeType: "image/png",
    mode: "describe",
    userDescription: "remember this screenshot as I want to research about this tomorrow",
    capturedAt: "2026-08-15T22:00:00-05:00",
  });
  assert(later.analysis.temporal?.due_at === "2026-08-16", "tomorrow → due_at next local day");
  assert(
    later.analysis.searchable_text.includes("2026-08-16"),
    "due date is indexed in searchable_text",
  );

  const saved = await store.saveMemory({
    userId: "demo-user",
    imageBytes: png(),
    contentType: "image/png",
    metadata: { analysis: event.analysis, title: event.analysis.title },
    searchableText: event.analysis.searchable_text,
  });
  assert(Boolean(saved.memory_id), "memory saved");

  const hits = await store.searchMemories({
    userId: "demo-user",
    query: "AI events Austin",
    topK: 5,
  });
  assert(hits.length >= 1, "search returns results");

  const ask = await analyzeSavedMemories({
    question: "What AI events did I save?",
    memories: hits.map((h) => ({
      memory_id: h.memory_id,
      title: h.analysis?.title || h.metadata.title,
    })),
  });
  assert(Boolean(ask.answer), "ask across memories returns answer");

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nAll mock API tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
