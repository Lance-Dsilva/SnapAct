/**
 * Authentication for SnapAct.
 *
 * Two independent doors:
 *   - the website, opened with a passcode and held open by a signed session cookie
 *   - the iPhone Shortcut endpoints, opened by a bearer key in a header
 *
 * Both checks run on the server. A passcode compared in the browser is not a
 * lock, it is a suggestion — anyone can open devtools and skip it — so nothing
 * here trusts the client.
 *
 * Uses Web Crypto only, so the same helpers work in middleware and route
 * handlers without a Node-only dependency.
 */

import { db } from "@/lib/db/supabase";

const PBKDF2_ITERATIONS = 210_000;
export const SESSION_COOKIE = "snapact_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

/* ------------------------------------------------------------------ helpers */

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Length-independent, value-independent comparison. */
export function timingSafeEqual(a: string, b: string) {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  // Compare a fixed number of bytes so the loop count never depends on input.
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/* ----------------------------------------------------------------- passcode */

export async function hashPasscode(
  passcode: string,
  saltB64?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltB64
    ? fromBase64Url(saltB64)
    : crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey("raw", encoder.encode(passcode), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );

  return { hash: toBase64Url(new Uint8Array(bits)), salt: toBase64Url(salt) };
}

export function isValidPasscode(value: string) {
  return /^\d{4,12}$/.test(value);
}

/* ------------------------------------------------------------------ session */

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  }
  return secret;
}

/** `<expiry>.<hmac>` — stateless, so verification needs no database round trip. */
export async function createSession(ttlSeconds = SESSION_TTL_SECONDS) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = String(expiresAt);
  const key = await signingKey(sessionSecret());
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return { token: `${payload}.${toBase64Url(new Uint8Array(signature))}`, maxAge: ttlSeconds };
}

export async function verifySession(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  try {
    const key = await signingKey(sessionSecret());
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature) as BufferSource,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

export function sessionCookie(token: string, maxAge: number) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/* ----------------------------------------------------------------- settings */

export interface AppSettings {
  passcode_hash: string;
  passcode_salt: string;
  shortcut_key: string;
  failed_attempts: number;
  locked_until: string | null;
}

const DEFAULT_PASSCODE = "9922";

/**
 * Read settings, seeding the row on first run so a fresh install is never
 * unlocked-by-default.
 */
export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await db()
    .from("app_settings")
    .select("passcode_hash, passcode_salt, shortcut_key, failed_attempts, locked_until")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw new Error(`Could not read auth settings: ${error.message}`);
  if (data) return data as AppSettings;

  const { hash, salt } = await hashPasscode(DEFAULT_PASSCODE);
  const seeded = {
    id: 1,
    passcode_hash: hash,
    passcode_salt: salt,
    shortcut_key: process.env.SHORTCUT_KEY?.trim() || `snapact_${crypto.randomUUID()}`,
    failed_attempts: 0,
    locked_until: null,
  };

  const { error: insertError } = await db().from("app_settings").insert(seeded);
  if (insertError && !insertError.message.includes("duplicate")) {
    throw new Error(`Could not initialise auth settings: ${insertError.message}`);
  }
  return seeded as AppSettings;
}

export interface UnlockResult {
  ok: boolean;
  reason?: "locked" | "wrong";
  remainingAttempts?: number;
  retryAfterSeconds?: number;
}

const MAX_ATTEMPTS = 5;

/** Lockout grows with repeated failure, so guessing 10,000 codes is impractical. */
function lockoutSeconds(attempts: number) {
  const beyond = attempts - MAX_ATTEMPTS;
  if (beyond < 0) return 0;
  return Math.min(60 * 2 ** beyond, 60 * 60);
}

export async function attemptUnlock(passcode: string): Promise<UnlockResult> {
  const settings = await getSettings();

  if (settings.locked_until) {
    const until = new Date(settings.locked_until).getTime();
    if (until > Date.now()) {
      return {
        ok: false,
        reason: "locked",
        retryAfterSeconds: Math.ceil((until - Date.now()) / 1000),
      };
    }
  }

  const { hash } = await hashPasscode(passcode, settings.passcode_salt);
  if (timingSafeEqual(hash, settings.passcode_hash)) {
    await db()
      .from("app_settings")
      .update({ failed_attempts: 0, locked_until: null, last_unlocked_at: new Date().toISOString() })
      .eq("id", 1);
    return { ok: true };
  }

  const attempts = settings.failed_attempts + 1;
  const lockFor = lockoutSeconds(attempts);
  await db()
    .from("app_settings")
    .update({
      failed_attempts: attempts,
      locked_until: lockFor ? new Date(Date.now() + lockFor * 1000).toISOString() : null,
    })
    .eq("id", 1);

  return {
    ok: false,
    reason: lockFor ? "locked" : "wrong",
    remainingAttempts: Math.max(MAX_ATTEMPTS - attempts, 0),
    retryAfterSeconds: lockFor || undefined,
  };
}

export async function changePasscode(current: string, next: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidPasscode(next)) {
    return { ok: false, error: "The new passcode must be 4 to 12 digits." };
  }

  const settings = await getSettings();
  const { hash: currentHash } = await hashPasscode(current, settings.passcode_salt);
  if (!timingSafeEqual(currentHash, settings.passcode_hash)) {
    return { ok: false, error: "That current passcode is not correct." };
  }

  const { hash, salt } = await hashPasscode(next);
  const { error } = await db()
    .from("app_settings")
    .update({
      passcode_hash: hash,
      passcode_salt: salt,
      passcode_updated: new Date().toISOString(),
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("id", 1);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* ----------------------------------------------------------- shortcut key */

export async function verifyShortcutKey(request: Request): Promise<boolean> {
  const presented =
    request.headers.get("x-snapact-key")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (!presented) return false;

  const settings = await getSettings();
  return timingSafeEqual(presented, settings.shortcut_key);
}

export async function rotateShortcutKey(): Promise<string> {
  const key = `snapact_${crypto.randomUUID().replace(/-/g, "")}`;
  const { error } = await db()
    .from("app_settings")
    .update({ shortcut_key: key, shortcut_rotated: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(`Could not rotate the key: ${error.message}`);
  return key;
}

/** The JSON a Shortcut sees when its key is missing or wrong. */
export function unauthorizedShortcut() {
  const message =
    "This endpoint needs your SnapAct key. In your Shortcut's “Get Contents of URL” action, " +
    "add a Header named X-SnapAct-Key with the key from SnapAct → Settings.";
  return Response.json({ error: message, detail: message, short_message: message }, { status: 401 });
}
