import { synthesizeAnswer } from "@/lib/agent";
import { handleCapture } from "@/lib/capture";
import { getConfig } from "@/lib/config";
import { retrieve, toAnswerContext } from "@/lib/retrieval/retrieve";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * iPhone Shortcut: Ask.
 *
 * With an image, this asks about that screenshot. Without one, it asks across
 * everything already saved. Replies are shaped for a Shortcut "Show Result"
 * card, so `short_message` is always plain text.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  const cfg = getConfig();

  let question = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.clone().formData();
    const image = form.get("image") || form.get("file") || form.get("screenshot");
    if (image instanceof File) return handleCapture(req, "ask");
    question = String(form.get("question") || form.get("q") || form.get("text") || "").trim();
  } else {
    const body = await req.json().catch(() => ({}));
    question = String(body.question || body.q || body.text || "").trim();
  }

  if (!question) {
    return Response.json(
      { error: "Ask needs a question, or attach a screenshot to ask about it." },
      { status: 400 },
    );
  }

  try {
    const found = await retrieve({ userId: cfg.demoUserId, question, limit: 6 });

    if (!found.memories.length) {
      const message = found.filteredToNothing
        ? "Nothing you've saved actually relates to that."
        : "You haven't saved anything about that yet.";
      return Response.json({
        answer: message,
        short_message: message,
        memories: [],
        considered: found.candidatesConsidered,
      });
    }

    const synthesized = await synthesizeAnswer({
      question,
      memories: toAnswerContext(found.memories),
    });

    return Response.json({
      answer: synthesized.answer,
      short_message: synthesized.short_message,
      memories: found.memories.map((m) => ({
        id: m.id,
        title: m.title,
        content_type: m.content_type,
      })),
      considered: found.candidatesConsidered,
      rejected: found.rejected,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Ask failed" },
      { status: 502 },
    );
  }
}
