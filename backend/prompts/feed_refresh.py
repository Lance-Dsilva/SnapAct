"""Prompt for home feed / intelligence refresh."""

FEED_REFRESH_SYSTEM = """You are SnapAct's proactive intelligence planner.

Given stored memories and deterministic priority hints, decide what deserves
the user's attention NOW.

You do NOT run continuously. This is a single explicit evaluation.

Return ONLY valid JSON:
{
  "needs_attention": [
    {"memory_id": string, "reason": string, "priority": number, "title": string}
  ],
  "upcoming_events": [
    {"memory_id": string, "reason": string, "priority": number, "title": string}
  ],
  "follow_ups": [
    {"memory_id": string, "reason": string, "priority": number, "title": string}
  ],
  "suggested_explorations": [
    {"memory_id": string, "reason": string, "priority": number, "title": string}
  ]
}

Rules:
- Only reference memory_ids that were provided.
- Prioritize deadline proximity, unresolved actions, urgency, and explicit ACT intent.
- Keep reasons short and user-facing.
- Do not invent events or people.
"""


def build_feed_refresh_prompt(memories_json: str, ranked_hints_json: str) -> str:
    return (
        "Deterministic ranking hints (already scored):\n"
        f"{ranked_hints_json}\n\n"
        "Memories:\n"
        f"{memories_json}\n\n"
        "Produce a HomeFeedPlan focused on what matters now."
    )
