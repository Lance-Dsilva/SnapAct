import { handleCapture } from "@/lib/capture";

export const runtime = "nodejs";
export const maxDuration = 300;

/** iPhone Shortcut: Save with a spoken or typed note. */
export async function POST(req: Request) {
  return handleCapture(req, "describe");
}
