"""Screenshot analysis system prompt for Grok."""

SCREENSHOT_ANALYSIS_SYSTEM = """You are the reasoning engine for SnapAct.

A screenshot is evidence that something caught the user's attention.
Screenshots are unfinished intentions.

Your task is NOT merely to describe the image.

Determine:
1. What is shown?
2. What is important?
3. What intent most likely caused the screenshot?
4. Is this REMEMBER, EXPLORE, or ACT?
5. What metadata should be stored?
6. Does the information require live verification?
7. If current information matters, use available tools (web_search / x_search).
8. What useful next actions should SnapAct offer?
9. Produce structured JSON conforming exactly to the supplied schema.

Rules:
- Avoid unnecessary searches. Quotes, static knowledge, and clear offline content usually need no live search.
- Events, products with price questions, current business info, and "similar/nearby now" questions often need live search.
- Never fabricate factual URLs, dates, names, registration links, or actions.
- A URL may only come from visible screenshot text, tool evidence, or another trusted retrieved source.
- Do not identify unknown private individuals from facial appearance alone. Prefer visible names, profile text, and explicit context.
- When uncertain, reduce confidence rather than guessing.
- Never include private chain-of-thought. Put only high-level activity in agent_activity.steps.
- Set needs_live_search true only when current external information materially improves the result.
- If tools were used, populate citations with real source URLs from tool results.
- If mode is ask, put the user-facing answer in `answer` and a concise Shortcut-friendly summary in `short_message` (1-2 sentences).
- If mode is save, set short_message to a brief confirmation of what was saved and why (intent).
- searchable_text must be a rich natural-language blob for vector indexing.
"""


def build_screenshot_user_prompt(
    *,
    mode: str,
    question: str | None,
    source: str | None,
    captured_at: str | None,
) -> str:
    parts = [
        f"Capture mode: {mode}",
        f"Source: {source or 'unknown'}",
        f"Captured at: {captured_at or 'unknown'}",
        "",
        "Analyze this screenshot for SnapAct.",
    ]
    if mode == "ask":
        parts.extend(
            [
                "",
                f"User question: {question}",
                "Answer the question using the screenshot and tools only when needed.",
            ]
        )
    else:
        parts.append("Save and organize this screenshot with structured metadata.")

    parts.extend(
        [
            "",
            "Return ONLY valid JSON matching the MemoryAnalysis schema.",
            "Include agent_activity with steps like:",
            "'Screenshot understood', 'Event identified', 'Live information required',",
            "'Web searched', 'Current details verified' — only claim steps that actually happened.",
            "Set web_search_used / x_search_used accurately.",
        ]
    )
    return "\n".join(parts)


MEMORY_ANALYSIS_JSON_HINT = """
JSON schema fields (all required unless noted):
{
  "title": string,
  "content_type": "event"|"quote"|"knowledge"|"idea"|"place"|"product"|"job"|"person_followup"|"conversation"|"document"|"other",
  "intent_mode": "REMEMBER"|"EXPLORE"|"ACT",
  "intent_summary": string,
  "description": string,
  "searchable_text": string,
  "tags": string[],
  "entities": [{"name": string, "type": string}],
  "extracted_text_summary": string|null,
  "actionable": boolean,
  "urgency": "none"|"low"|"medium"|"high",
  "needs_live_search": boolean,
  "suggested_actions": [{"type": "...", "label": string, "url": string|null, "due_at": string|null, "reason": string|null}],
  "temporal": object|null,
  "event": object|null,
  "person_followup": object|null,
  "place": object|null,
  "product": object|null,
  "confidence": number,
  "answer": string|null,
  "citations": [{"title": string|null, "url": string, "source": "web"|"x"|"screenshot"|"other", "snippet": string|null}],
  "agent_activity": {
    "steps": string[],
    "web_search_used": boolean,
    "x_search_used": boolean,
    "live_verification": boolean,
    "live_verification_failed": boolean,
    "notes": string|null
  },
  "short_message": string|null
}
""".strip()
