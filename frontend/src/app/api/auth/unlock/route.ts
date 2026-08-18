import { attemptUnlock, createSession, isValidPasscode, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const passcode = String(body.passcode || "").trim();

  if (!isValidPasscode(passcode)) {
    return Response.json({ error: "Enter your passcode." }, { status: 400 });
  }

  try {
    const result = await attemptUnlock(passcode);

    if (!result.ok) {
      const message =
        result.reason === "locked"
          ? `Too many attempts. Try again in ${Math.ceil((result.retryAfterSeconds ?? 60) / 60)} min.`
          : `Wrong passcode. ${result.remainingAttempts} attempt${
              result.remainingAttempts === 1 ? "" : "s"
            } left.`;
      return Response.json(
        { error: message, locked: result.reason === "locked", retry_after: result.retryAfterSeconds },
        { status: result.reason === "locked" ? 429 : 401 },
      );
    }

    const { token, maxAge } = await createSession();
    return Response.json(
      { ok: true },
      { status: 200, headers: { "Set-Cookie": sessionCookie(token, maxAge) } },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unlock failed" },
      { status: 500 },
    );
  }
}
