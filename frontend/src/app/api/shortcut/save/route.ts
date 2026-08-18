import { unauthorizedShortcut, verifyShortcutKey } from "@/lib/auth";
import { handleCapture } from "@/lib/capture";
import { methodHelp } from "@/lib/shortcut-help";

export const runtime = "nodejs";
export const maxDuration = 300;

/** iPhone Shortcut: Save. Understands and files the screenshot in one call. */
export async function POST(req: Request) {
  if (!(await verifyShortcutKey(req))) return unauthorizedShortcut();
  return handleCapture(req, "save");
}

/** Shortcuts defaults to GET; explain the fix rather than returning a bare 405. */
export async function GET() {
  return methodHelp("save");
}
