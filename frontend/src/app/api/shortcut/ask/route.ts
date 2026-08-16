import { handleCapture } from "@/lib/capture-handler";
import { retrieveAskMemories, synthesizeAsk, visibleAskMarkdown } from "@/lib/ask-flow";

export const runtime = "nodejs";
export const maxDuration = 300;

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function readQuestion(req: Request): Promise<{
  question: string;
  stream: boolean;
  hasImage: boolean;
  raw: Request;
}> {
  const accept = req.headers.get("accept") || "";
  const url = new URL(req.url);
  const streamFlag = url.searchParams.get("stream") === "1" || accept.includes("text/event-stream");
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return {
      question: String(body.question || body.text || body.q || "").trim(),
      stream: streamFlag || Boolean(body.stream),
      hasImage: false,
      raw: req,
    };
  }

  const form = await req.formData();
  const image = form.get("image") || form.get("file") || form.get("screenshot");
  const question = String(
    form.get("question") || form.get("q") || form.get("ask") || form.get("text") || "",
  ).trim();
  return {
    question,
    stream: streamFlag || String(form.get("stream") || "") === "1",
    hasImage: image instanceof File,
    raw: req,
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

  const memories = await retrieveAskMemories(parsed.question, 8);

  if (!parsed.stream) {
    const synthesized = await synthesizeAsk({ question: parsed.question, memories });
    return Response.json({
      answer: synthesized.answer,
      short_message: synthesized.short_message,
      memories,
      citations: synthesized.citations,
      agent_activity: synthesized.agent_activity,
    });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(sse(payload)));
      try {
        send({ type: "memories", memories });
        let raw = "";
        const synthesized = await synthesizeAsk({
          question: parsed.question,
          memories,
          onText(chunk) {
            raw += chunk;
            send({ type: "delta", text: visibleAskMarkdown(raw) });
          },
        });
        send({
          type: "done",
          answer: synthesized.answer,
          short_message: synthesized.short_message,
          memories,
        });
      } catch (err) {
        send({ type: "error", detail: err instanceof Error ? err.message : "Ask failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
