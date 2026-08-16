/** Short card copy. RAG `description` is an index blob, not UI text. */
export function cardSummary(input: {
  title?: string | null;
  description?: string | null;
  user_description?: string | null;
  analysis?: { description?: string | null; intent_summary?: string | null } | null;
  metadata?: Record<string, unknown> | null;
}) {
  const meta = input.metadata || {};
  const candidates = [
    typeof meta.summary === "string" ? meta.summary : "",
    input.analysis?.description || "",
    input.description || "",
    input.analysis?.intent_summary || "",
    input.user_description || (typeof meta.user_description === "string" ? meta.user_description : ""),
  ].filter((value) => value.trim() && !isInternalNote(value));
  const raw = candidates.find((value) => value.trim()) || "";
  return shortenIndexBlob(raw, input.title || "");
}

export function shortenIndexBlob(text: string, title = "") {
  let t = text.replace(/\s+/g, " ").trim();
  t = t.replace(/Uploaded at \S+/gi, "");
  t = t.replace(/Due date:\s*\S+/gi, "");
  t = t.replace(/Things to do[^.]*\.?/gi, "");
  t = t.replace(/User context:.*$/i, "");
  t = t.replace(/User question:.*$/i, "");
  t = t.replace(/Category:\s*\w+\.?/gi, "");
  t = t.replace(/Intent:\s*\w+\.?/gi, "");
  t = t.replace(/remember this rag[^.]*\.?/gi, "");
  t = t.replace(/latest-first test[^.]*\.?/gi, "");
  t = t.replace(/^remember this (screenshot )?as\s+/i, "");
  if (title) {
    const re = new RegExp(`^${escapeReg(title)}[.\\s:-]*`, "i");
    t = t.replace(re, "");
  }
  const parts = t.split(/(?<=\.)\s+/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase().slice(0, 48);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(part);
    if (uniq.length >= 2) break;
  }
  return (uniq.join(" ") || t).slice(0, 180).trim();
}

function isInternalNote(value: string) {
  return /latest-first test|remember this rag screenshot uploaded now/i.test(value);
}

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
