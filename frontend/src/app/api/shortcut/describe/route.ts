import { unauthorizedShortcut, verifyShortcutKey } from "@/lib/auth";
import { handleCapture } from "@/lib/capture";
import { methodHelp } from "@/lib/shortcut-help";

export const runtime = "nodejs";
export const maxDuration = 300;

/** iPhone Shortcut: Save with a spoken or typed note. */
export async function POST(req: Request) {
  if (!(await verifyShortcutKey(req))) return unauthorizedShortcut();
  return handleCapture(req, "describe");
}

/** Shortcuts defaults to GET; explain the fix rather than returning a bare 405. */
export async function GET() {
  return methodHelp("describe");
}
