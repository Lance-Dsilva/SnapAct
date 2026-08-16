import { handleCapture } from "@/lib/capture-handler";
import { formatAskFromMemories, retrieveAskMemories } from "@/lib/ask-flow";

export const runtime = "nodejs";
export const maxDuration = 300;

async function readQuestion(req: Request): Promise<{
  question: string;
  hasImage: boolean;
}> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return {
      question: String(body.question || body.text || body.q || "").trim(),
      hasImage: false,
    };
  }

  const form = await req.formData();
  const image = form.get("image") || form.get("file") || form.get("screenshot");
  const question = String(
    form.get("question") || form.get("q") || form.get("ask") || form.get("text") || "",
  ).trim();
  return {
    question,
    hasImage: image instanceof File,
  };
}

export async function POST(req: Request) {
  const cloned = req.clone();
  const parsed = await readQuestion(cloned);
  if (parsed.hasImage) {
    return handleCapture(req, "ask");
  }
  if (!parsed.question) {
    return Response.json(
      { detail: "question is required (JSON or form field: question / text). Attach image to ask about a screenshot." },
      { status: 400 },
    );
  }

  const memories = await retrieveAskMemories(parsed.question, 5, {
    requireImage: false,
    signImages: false,
  });
  const synthesized = formatAskFromMemories(parsed.question, memories);
  return Response.json({
    answer: synthesized.answer,
    short_message: synthesized.short_message,
    memories,
    citations: synthesized.citations,
    agent_activity: synthesized.agent_activity,
  });
}
