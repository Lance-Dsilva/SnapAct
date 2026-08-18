import { getSettings, rotateShortcutKey } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Behind the session gate, so only an unlocked owner can read or rotate the key. */
export async function GET() {
  const settings = await getSettings();
  return Response.json({ key: settings.shortcut_key });
}

export async function POST() {
  const key = await rotateShortcutKey();
  return Response.json({ key });
}
