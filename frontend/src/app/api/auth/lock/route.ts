import { clearedSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  return Response.json(
    { ok: true },
    { status: 200, headers: { "Set-Cookie": clearedSessionCookie() } },
  );
}
