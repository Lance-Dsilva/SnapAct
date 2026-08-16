import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { countMemories, listMemories, typeCounts, withImageUrls } from "@/lib/db/memories";
import { serializeMemory } from "@/lib/serialize";
import {
  isContentType,
  type ContentType,
  type IntentMode,
  type MemoryStatus,
} from "@/lib/schemas/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A real listing: ORDER BY created_at with filters and pagination, replacing the
 * old approach of firing five fixed semantic probes and merging whatever returned.
 */
export async function GET(req: Request) {
  try {
    const cfg = getConfig();
    const { searchParams } = new URL(req.url);

    const contentTypes = (searchParams.getAll("content_type").flatMap((v) => v.split(",")))
      .map((v) => v.trim())
      .filter((v) => v && v !== "all")
      .filter(isContentType) as ContentType[];

    const intentModes = searchParams
      .getAll("intent_mode")
      .flatMap((v) => v.split(","))
      .map((v) => v.trim().toUpperCase())
      .filter((v) => ["REMEMBER", "EXPLORE", "ACT"].includes(v)) as IntentMode[];

    const statusParam = searchParams
      .getAll("status")
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter((v) => ["pending", "ready", "failed"].includes(v)) as MemoryStatus[];

    const limit = Number(searchParams.get("limit") || 50);
    const offset = Number(searchParams.get("offset") || 0);

    const [memories, total, counts] = await Promise.all([
      listMemories({
        userId: cfg.demoUserId,
        limit,
        offset,
        contentTypes: contentTypes.length ? contentTypes : undefined,
        intentModes: intentModes.length ? intentModes : undefined,
        status: statusParam.length ? statusParam : undefined,
        actionable: searchParams.get("actionable") === "true" ? true : undefined,
        includeCompleted: searchParams.get("include_completed") !== "false",
        hasImage: searchParams.get("has_image") === "true",
        orderBy: (searchParams.get("order_by") as "created_at" | "due_on" | "event_on") || undefined,
      }),
      countMemories(cfg.demoUserId),
      typeCounts(cfg.demoUserId),
    ]);

    const withUrls = await withImageUrls(memories);

    return NextResponse.json(
      {
        memories: withUrls.map(serializeMemory),
        total,
        counts,
        limit,
        offset,
        has_more: offset + withUrls.length < total,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/memories] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not list memories" },
      { status: 502 },
    );
  }
}
