import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { retrieve } from "@/lib/retrieval/retrieve";
import { serializeRetrieved } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 120;

async function search(query: string, limit: number, gate: boolean) {
  const cfg = getConfig();
  const found = await retrieve({
    userId: cfg.demoUserId,
    question: query,
    limit,
    useGate: gate,
  });
  return NextResponse.json({
    query,
    results: found.memories.map(serializeRetrieved),
    considered: found.candidatesConsidered,
    rejected: found.rejected,
    filtered_to_nothing: found.filteredToNothing,
    plan: found.plan,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") || searchParams.get("query") || "").trim();
  if (!query) return NextResponse.json({ error: "q is required" }, { status: 400 });
  try {
    // Browsing the search box: keep it fast and permissive, no gate.
    return await search(query, Number(searchParams.get("limit") || 20), false);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const query = String(body.query || body.q || "").trim();
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
  try {
    return await search(query, Number(body.limit || body.top_k || 20), body.gate !== false);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 502 },
    );
  }
}
