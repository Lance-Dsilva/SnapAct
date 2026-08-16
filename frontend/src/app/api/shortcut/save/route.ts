import { handleCapture } from "@/lib/capture";

export const runtime = "nodejs";
export const maxDuration = 300;

/** iPhone Shortcut: Save. Understands and files the screenshot in one call. */
export async function POST(req: Request) {
  return handleCapture(req, "save");
}
