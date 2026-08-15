import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { refreshHomeFeed } from "@/lib/memory/feed";
import { getMemoryStore } from "@/lib/memory/memory-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    const cfg = getConfig();
    const store = getMemoryStore();
    const memories = await store.listRecent({
      userId: cfg.demoUserId,
      limit: 50,
    });
    const feed = await refreshHomeFeed(memories);
    return NextResponse.json(feed);
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Intelligence refresh failed" },
      { status: 502 },
    );
  }
}
