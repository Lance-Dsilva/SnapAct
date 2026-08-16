export function detectAskIntents(question?: string | null) {
  const q = (question || "").toLowerCase();
  return {
    similar: /\bsimilar\b|\balike\b|\blike this\b|\brelated (to this|screenshots|memories)\b/.test(q),
    web: /\bweb\s*search\b|\bsearch the web\b|\bgoogle\b|\blook up online\b|\bsearch online\b/.test(q),
  };
}
