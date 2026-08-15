import { NextResponse } from "next/server";
import { cursorConfigured } from "@/lib/agents/snapact-agent";
import { getConfig, usingRemoteMemory } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const cfg = getConfig();
  return NextResponse.json({
    status: "ok",
    service: "snapact",
    cursor_configured: cursorConfigured(),
    memory_store_configured: true,
    using_remote_memory: usingRemoteMemory(),
    demo_user_id: cfg.demoUserId,
    model_configured: Boolean(cfg.cursorModel) || cfg.useMockCursor,
  });
}
