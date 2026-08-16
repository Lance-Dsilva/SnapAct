import { retrieveAskMemories, synthesizeAsk, visibleAskMarkdown } from "@/lib/ask-flow";

export const runtime = "nodejs";
export const maxDuration = 300;

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = String(body.question || body.text || body.q || "").trim();
    const topK = Number(body.top_k || 8);
    const stream =
      Boolean(body.stream) ||
      (req.headers.get("accept") || "").includes("text/event-stream");
    if (!question) {
      return Response.json({ detail: "question is required" }, { status: 400 });
    }

    const memories = await retrieveAskMemories(question, topK);

    if (!stream) {
      const synthesized = await synthesizeAsk({ question, memories });
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
            question,
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
            citations: synthesized.citations,
            agent_activity: synthesized.agent_activity,
          });
        } catch (err) {
          send({
            type: "error",
            detail: err instanceof Error ? err.message : "Ask failed",
          });
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
  } catch (err) {
    return Response.json(
      { detail: err instanceof Error ? err.message : "Ask failed" },
      { status: 502 },
    );
  }
}
