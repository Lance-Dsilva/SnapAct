import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { retrieveCandidates } from "@/lib/retrieval/retrieve";
import { serializeRetrieved } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Raw hybrid search — no model in the loop, so it returns in well under a second.
 * Relevance gating belongs to /api/ask; browsing wants breadth, not judgement.
 */
async function search(query: string, limit: number) {
  const cfg = getConfig();
  const results = await retrieveCandidates({
    userId: cfg.demoUserId,
    query,
    limit: Math.min(Math.max(limit, 1), 50),
  });
  return NextResponse.json({
    query,
    results: results.map(serializeRetrieved),
    count: results.length,
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") || searchParams.get("query") || "").trim();
  if (!query) return NextResponse.json({ error: "q is required" }, { status: 400 });
  try {
    return await search(query, Number(searchParams.get("limit") || 20));
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
    return await search(query, Number(body.limit || body.top_k || 20));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 502 },
    );
  }
}
