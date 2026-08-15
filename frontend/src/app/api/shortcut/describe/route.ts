import { handleCapture } from "@/lib/capture-handler";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  return handleCapture(req, "describe");
}
