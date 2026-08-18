import { changePasscode } from "@/lib/auth";

export const runtime = "nodejs";

/** Requires an unlocked session (enforced by middleware) AND the current passcode. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const current = String(body.current || "").trim();
  const next = String(body.next || "").trim();

  const result = await changePasscode(current, next);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ ok: true });
}
