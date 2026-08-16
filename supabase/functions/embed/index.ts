// Embedding service for SnapAct retrieval.
//
// Uses Supabase's built-in gte-small model (384 dims, cosine). Runs inside the
// edge runtime, so there is no third-party embedding API, no extra key, and no
// per-token cost. Matches the vector(384) column in the memories table.

const model = new Supabase.ai.Session("gte-small");

const MAX_CHARS = 8000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let payload: { input?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  // Accept a single string or a batch, always answer with a batch.
  const raw = payload.input;
  const inputs = (Array.isArray(raw) ? raw : [raw])
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS))
    .filter((value) => value.length > 0);

  if (!inputs.length) {
    return json({ error: "input is required (string or string[])" }, 400);
  }
  if (inputs.length > 64) {
    return json({ error: "Batch limit is 64 inputs" }, 400);
  }

  try {
    const embeddings: number[][] = [];
    for (const input of inputs) {
      const vector = (await model.run(input, {
        mean_pool: true,
        normalize: true,
      })) as number[];
      embeddings.push(vector);
    }
    return json({ embeddings, dimensions: embeddings[0]?.length ?? 0, model: "gte-small" });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Embedding failed" },
      500,
    );
  }
});
