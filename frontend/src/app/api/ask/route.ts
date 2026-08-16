import { after } from "next/server";
import { getConfig } from "@/lib/config";
import { sweepStalled } from "@/lib/enrich";
import { askMemories } from "@/lib/retrieval/retrieve";
import { serializeRetrieved } from "@/lib/serialize";

export const runtime = "nodejs";
export const maxDuration = 300;

function sse(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Honest answer when nothing relevant was found. The old flow always had
 * memories to hand — even for a nonsense query — and always produced a confident
 * answer from them. Saying "I don't have that" is a feature.
 */
function emptyAnswer(question: string, filteredToNothing: boolean) {
  return {
    answer: filteredToNothing
      ? `I don't have any saved screenshots that answer "${question}".\n\nSome were loosely similar, but none actually relate to what you asked.`
      : `I don't have any saved screenshots about "${question}" yet.`,
    short_message: "Nothing saved about that yet.",
  };
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

  after(() => sweepStalled(cfg.demoUserId));

  if (!wantsStream) {
    try {
      const result = await askMemories({ userId: cfg.demoUserId, question, limit });
      if (!result.matched) {
        return Response.json({
          ...emptyAnswer(question, result.filteredToNothing),
          memories: [],
          considered: result.candidatesConsidered,
        });
      }
      return Response.json({
        answer: result.answer,
        short_message: result.short_message,
        memories: result.memories.map(serializeRetrieved),
        considered: result.candidatesConsidered,
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

        let buffer = "";
        const result = await askMemories({
          userId: cfg.demoUserId,
          question,
          limit,
          onText(chunk) {
            buffer += chunk;
            // Suppress the refusal token and the trailing control blocks.
            const visible = buffer.split(/\n?---SHORT---|\n?---USED---/)[0];
            if (!/NO_MATCH/.test(visible)) send({ type: "delta", text: visible });
          },
        });

        if (!result.matched) {
          const empty = emptyAnswer(question, result.filteredToNothing);
          send({ type: "delta", text: empty.answer });
          send({ type: "done", ...empty, memories: [] });
          return;
        }

        send({
          type: "memories",
          memories: result.memories.map(serializeRetrieved),
          considered: result.candidatesConsidered,
        });
        send({
          type: "done",
          answer: result.answer,
          short_message: result.short_message,
          memories: result.memories.map(serializeRetrieved),
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
