"""Deterministic + Grok hybrid home feed ranking."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from schemas.memory import AttentionItem, HomeFeedPlan, MemoryRecord
from services.grok import get_grok_service


def _priority_score(mem: MemoryRecord) -> float:
    analysis = mem.analysis
    meta = mem.metadata or {}
    score = 0.0

    urgency = (analysis.urgency if analysis else meta.get("urgency")) or "none"
    score += {"none": 0, "low": 0.1, "medium": 0.25, "high": 0.45}.get(str(urgency), 0)

    intent = (analysis.intent_mode if analysis else meta.get("intent_mode")) or "REMEMBER"
    if intent == "ACT":
        score += 0.25
    elif intent == "EXPLORE":
        score += 0.1

    actionable = analysis.actionable if analysis else bool(meta.get("actionable"))
    if actionable:
        score += 0.15

    if not mem.completed:
        score += 0.1
    else:
        score -= 0.2

    # Recency bonus (rough)
    try:
        created = datetime.fromisoformat(mem.created_at.replace("Z", "+00:00"))
        age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600
        score += max(0.0, 0.2 - (age_hours / (24 * 14)) * 0.2)
    except Exception:  # noqa: BLE001
        pass

    # Event date proximity
    event_date = None
    if analysis and analysis.temporal and analysis.temporal.event_date:
        event_date = analysis.temporal.event_date
    elif analysis and analysis.event and analysis.event.date:
        event_date = analysis.event.date
    if event_date:
        try:
            ed = datetime.fromisoformat(event_date[:10]).date()
            days = (ed - datetime.now(timezone.utc).date()).days
            if 0 <= days <= 2:
                score += 0.35
            elif 0 <= days <= 7:
                score += 0.2
            elif 0 <= days <= 30:
                score += 0.1
        except Exception:  # noqa: BLE001
            pass

    return round(min(score, 1.0), 4)


def _title(mem: MemoryRecord) -> str:
    if mem.analysis:
        return mem.analysis.title
    return str(mem.metadata.get("title") or mem.memory_id)


def _content_type(mem: MemoryRecord) -> str | None:
    if mem.analysis:
        return mem.analysis.content_type
    return mem.metadata.get("content_type")


def _intent(mem: MemoryRecord) -> str | None:
    if mem.analysis:
        return mem.analysis.intent_mode
    return mem.metadata.get("intent_mode")


def build_deterministic_hints(memories: list[MemoryRecord]) -> list[dict[str, Any]]:
    hints: list[dict[str, Any]] = []
    for mem in memories:
        if mem.metadata.get("demo_seed") and len(memories) > 8:
            # Keep seeds unless user has few real captures — still useful for empty demos.
            pass
        ct = _content_type(mem)
        intent = _intent(mem)
        score = _priority_score(mem)
        bucket = "suggested_explorations"
        reason = mem.analysis.intent_summary if mem.analysis else "Saved screenshot"
        if ct == "event" or (mem.analysis and mem.analysis.event):
            bucket = "upcoming_events"
            reason = "Upcoming event"
        if ct == "person_followup" or (mem.analysis and mem.analysis.person_followup):
            bucket = "follow_ups"
            pf = mem.analysis.person_followup if mem.analysis else None
            reason = f"Follow up about {pf.topic}" if pf and pf.topic else "Follow-up needed"
        if intent == "ACT" and not mem.completed and score >= 0.4:
            bucket = "needs_attention"
            if ct == "event":
                reason = "Registration / event approaching"
        if intent == "EXPLORE":
            bucket = "suggested_explorations"
            reason = "Worth exploring"
        if ct == "quote":
            bucket = "quotes"
            reason = "Saved quote"

        hints.append(
            {
                "memory_id": mem.memory_id,
                "title": _title(mem),
                "reason": reason,
                "priority": score,
                "bucket": bucket,
                "content_type": ct,
                "intent_mode": intent,
                "image_url": mem.image_url,
            }
        )
    hints.sort(key=lambda h: h["priority"], reverse=True)
    return hints


async def refresh_home_feed(memories: list[MemoryRecord]) -> HomeFeedPlan:
    hints = build_deterministic_hints(memories)
    grok = get_grok_service()

    compact = [
        {
            "memory_id": m.memory_id,
            "title": _title(m),
            "content_type": _content_type(m),
            "intent_mode": _intent(m),
            "urgency": m.analysis.urgency if m.analysis else m.metadata.get("urgency"),
            "actionable": m.analysis.actionable if m.analysis else m.metadata.get("actionable"),
            "completed": m.completed,
            "event": m.analysis.event.model_dump() if m.analysis and m.analysis.event else None,
            "person_followup": (
                m.analysis.person_followup.model_dump()
                if m.analysis and m.analysis.person_followup
                else None
            ),
            "description": m.analysis.description if m.analysis else m.metadata.get("description"),
        }
        for m in memories[:40]
    ]

    try:
        plan = await grok.refresh_feed_plan(memories=compact, ranked_hints=hints)
    except Exception:  # noqa: BLE001
        plan = {}

    by_id = {m.memory_id: m for m in memories}

    def hydrate(items: list[dict[str, Any]] | None, fallback_bucket: str) -> list[AttentionItem]:
        raw = items if items else [h for h in hints if h["bucket"] == fallback_bucket]
        out: list[AttentionItem] = []
        for item in raw[:8]:
            mid = item.get("memory_id")
            mem = by_id.get(mid)
            if not mem:
                continue
            action = None
            if mem.analysis and mem.analysis.suggested_actions:
                action = mem.analysis.suggested_actions[0]
            out.append(
                AttentionItem(
                    memory_id=mid,
                    title=item.get("title") or _title(mem),
                    reason=item.get("reason") or "",
                    priority=float(item.get("priority") or _priority_score(mem)),
                    content_type=_content_type(mem),  # type: ignore[arg-type]
                    intent_mode=_intent(mem),  # type: ignore[arg-type]
                    image_url=mem.image_url,
                    suggested_action=action,
                )
            )
        return out

    recent = [
        AttentionItem(
            memory_id=m.memory_id,
            title=_title(m),
            reason=m.analysis.intent_summary if m.analysis else "Recent capture",
            priority=_priority_score(m),
            content_type=_content_type(m),  # type: ignore[arg-type]
            intent_mode=_intent(m),  # type: ignore[arg-type]
            image_url=m.image_url,
        )
        for m in sorted(memories, key=lambda x: x.created_at, reverse=True)[:12]
    ]

    return HomeFeedPlan(
        generated_at=datetime.now(timezone.utc).isoformat(),
        needs_attention=hydrate(plan.get("needs_attention"), "needs_attention"),
        upcoming_events=hydrate(plan.get("upcoming_events"), "upcoming_events"),
        follow_ups=hydrate(plan.get("follow_ups"), "follow_ups"),
        suggested_explorations=hydrate(plan.get("suggested_explorations"), "suggested_explorations"),
        quotes=hydrate(None, "quotes"),
        recent=recent,
    )
