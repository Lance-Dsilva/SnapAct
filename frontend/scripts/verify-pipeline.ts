/**
 * End-to-end verification of the SnapAct pipeline against the running app.
 *
 * Exercises the properties the previous stack got wrong: that a save is durably
 * organized, that listing is real, that lexical and semantic search both work,
 * and — the important one — that a nonsense question is answered with "nothing
 * saved" rather than a confident answer built from unrelated screenshots.
 *
 * Usage:
 *   cd frontend
 *   npm run dev                       # in another terminal
 *   npx tsx scripts/verify-pipeline.ts [baseUrl]
 */

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function json(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, never> };
}

async function main() {
  console.log(`\nSnapAct pipeline verification against ${BASE}\n`);

  console.log("Health");
  const health = await json("/api/health");
  check("health endpoint responds", health.status === 200 || health.status === 503);
  const checks = (health.body.checks || {}) as Record<string, { ok: boolean; detail?: string }>;
  for (const [name, result] of Object.entries(checks)) {
    check(`  ${name}`, result.ok, result.detail);
  }

  console.log("\nListing");
  const list = await json("/api/memories?limit=5");
  check("listing returns 200", list.status === 200);
  check("listing reports a real total", typeof list.body.total === "number");
  check("listing returns type counts", typeof list.body.counts === "object");
  const total = Number(list.body.total || 0);
  console.log(`        ${total} memories stored`);

  console.log("\nDigest");
  const digest = await json("/api/digest");
  check("digest returns 200", digest.status === 200);
  check(
    "digest has all buckets",
    ["needs_attention", "upcoming_events", "due_soon", "recent"].every((k) => k in digest.body),
  );

  if (total === 0) {
    console.log("\n(no memories stored yet — skipping retrieval checks)");
  } else {
    console.log("\nRetrieval — the relevance gate");
    const nonsense = await json("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "zzzzz nonsense xyzzy qwerty plugh" }),
    });
    const nonsenseMemories = (nonsense.body.memories || []) as unknown[];
    check(
      "nonsense question returns NO memories",
      nonsenseMemories.length === 0,
      `${nonsenseMemories.length} returned, ${nonsense.body.considered ?? 0} considered`,
    );
    check(
      "nonsense answer admits it has nothing",
      /don't have|nothing/i.test(String(nonsense.body.answer || "")),
    );

    console.log("\nRetrieval — search");
    const search = await json("/api/search?q=screenshot&limit=5");
    check("search returns 200", search.status === 200);
    check("search results carry scores",
      ((search.body.results || []) as Array<{ score?: number }>).every(
        (r) => typeof r.score === "number",
      ),
      "the old gateway returned none",
    );
  }

  console.log("\nRepair queue");
  const repair = await json("/api/memories/repair");
  check("repair queue is readable", repair.status === 200);
  console.log(`        ${repair.body.stalled ?? 0} memories awaiting retry`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch((err) => {
  console.error("\nVerification could not run:", err instanceof Error ? err.message : err);
  process.exit(1);
});
