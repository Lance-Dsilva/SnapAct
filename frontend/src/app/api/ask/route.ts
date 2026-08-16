import { synthesizeAnswer } from "@/lib/agent";
import { getConfig } from "@/lib/config";
import { retrieve, toAnswerContext } from "@/lib/retrieval/retrieve";
import { serializeRetrieved } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 300;

function sse(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Honest answer when retrieval finds nothing. The old flow always had memories to
 * hand — even for a nonsense query — and always produced a confident answer from
 * them. Saying "I don't have that" is a feature.
 */
function emptyAnswer(question: string, filteredToNothing: boolean) {
  const answer = filteredToNothing
    ? `I don't have any saved screenshots that answer "${question}".\n\nI found some that were loosely similar, but none of them actually relate to what you asked.`
    : `I don't have any saved screenshots about "${question}" yet.`;
  return { answer, short_message: `Nothing saved about that yet.` };
}

export async function POST(req: Request) {
  const cfg = getConfig();
  const body = await req.json().catch(() => ({}));
  const question = String(body.question || body.text || body.q || "").trim();
  const limit = Math.min(Number(body.top_k || body.limit || 8), 20);
  const wantsStream =
    Boolean(body.stream) || (req.headers.get("accept") || "").includes("text/event-stream");

  if (!question) {
    return Response.json({ error: "A question is required." }, { status: 400 });
  }

  if (!wantsStream) {
    try {
      const found = await retrieve({ userId: cfg.demoUserId, question, limit });
      if (!found.memories.length) {
        const empty = emptyAnswer(question, found.filteredToNothing);
        return Response.json({
          ...empty,
          memories: [],
          considered: found.candidatesConsidered,
          rejected: found.rejected,
        });
      }
      const synthesized = await synthesizeAnswer({
        question,
        memories: toAnswerContext(found.memories),
      });
      return Response.json({
        answer: synthesized.answer,
        short_message: synthesized.short_message,
        memories: found.memories.map(serializeRetrieved),
        considered: found.candidatesConsidered,
        rejected: found.rejected,
        plan: found.plan,
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Ask failed" },
        { status: 502 },
      );
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(sse(payload)));
      try {
        send({ type: "status", text: "Searching your screenshots" });
        const found = await retrieve({ userId: cfg.demoUserId, question, limit });

        send({
          type: "memories",
          memories: found.memories.map(serializeRetrieved),
          considered: found.candidatesConsidered,
          rejected: found.rejected,
        });

        if (!found.memories.length) {
          const empty = emptyAnswer(question, found.filteredToNothing);
          send({ type: "delta", text: empty.answer });
          send({ type: "done", ...empty, memories: [] });
          return;
        }

        send({ type: "status", text: "Reading what you saved" });
        let buffer = "";
        const synthesized = await synthesizeAnswer({
          question,
          memories: toAnswerContext(found.memories),
          onText(chunk) {
            buffer += chunk;
            send({ type: "delta", text: buffer.split(/\n?---SHORT---/)[0] });
          },
        });

        send({
          type: "done",
          answer: synthesized.answer,
          short_message: synthesized.short_message,
          memories: found.memories.map(serializeRetrieved),
        });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Ask failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
