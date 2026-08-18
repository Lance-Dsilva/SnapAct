import { after } from "next/server";
import { unauthorizedShortcut, verifyShortcutKey } from "@/lib/auth";
import { handleCapture } from "@/lib/capture";
import { getConfig } from "@/lib/config";
import { sweepStalled } from "@/lib/enrich";
import { askMemories } from "@/lib/retrieval/retrieve";
import { methodHelp } from "@/lib/shortcut-help";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * iPhone Shortcut: Ask.
 *
 * With an image, answers about that screenshot. Without one, answers across
 * everything saved. `short_message` is always plain text for "Show Result".
 */
export async function POST(req: Request) {
  if (!(await verifyShortcutKey(req))) return unauthorizedShortcut();

  const contentType = req.headers.get("content-type") || "";
  const cfg = getConfig();

  let question = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.clone().formData();
    const image = form.get("image") || form.get("file") || form.get("screenshot") || form.get("photo");
    if (image instanceof File) return handleCapture(req, "ask");
    question = String(form.get("question") || form.get("q") || form.get("text") || "").trim();
  } else {
    const body = await req.json().catch(() => ({}));
    question = String(body.question || body.q || body.text || "").trim();
  }

  if (!question) {
    const message = "Ask needs a question, or attach a screenshot to ask about it.";
    return Response.json({ error: message, detail: message }, { status: 400 });
  }

  after(() => sweepStalled(cfg.demoUserId));

  try {
    const result = await askMemories({ userId: cfg.demoUserId, question, limit: 6 });

    if (!result.matched) {
      const message = result.filteredToNothing
        ? "Nothing you've saved actually relates to that."
        : "You haven't saved anything about that yet.";
      return Response.json({ answer: message, short_message: message, memories: [] });
    }

    return Response.json({
      answer: result.answer,
      short_message: result.short_message,
      memories: result.memories.map((m) => ({
        id: m.id,
        title: m.title,
        content_type: m.content_type,
      })),
      considered: result.candidatesConsidered,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ask failed";
    return Response.json({ error: message, detail: message }, { status: 502 });
  }
}

/** Shortcuts defaults to GET; explain the fix rather than returning a bare 405. */
export async function GET() {
  return methodHelp("ask");
}
