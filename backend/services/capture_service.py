"""Capture orchestration: validate → Grok → MemoryStore."""

from __future__ import annotations

import logging
from typing import Any

from config import get_settings
from schemas.api import CaptureResponse
from schemas.memory import AgentActivity, MemoryAnalysis
from services import idempotency
from services.grok import GrokError, get_grok_service
from services.memory_store import get_memory_store

logger = logging.getLogger("snapact.capture")


async def process_capture(
    *,
    image_bytes: bytes,
    content_type: str,
    mode: str,
    question: str | None,
    source: str | None,
    captured_at: str | None,
    client_request_id: str | None,
    request_id: str,
) -> CaptureResponse:
    cached = idempotency.get_cached_response(client_request_id)
    if cached:
        logger.info(
            "idempotent hit request_id=%s client_request_id=%s",
            request_id,
            client_request_id,
        )
        resp = CaptureResponse.model_validate(cached)
        resp.duplicate = True
        return resp

    settings = get_settings()
    grok = get_grok_service()
    store = get_memory_store()

    logger.info(
        "capture start request_id=%s source=%s mode=%s phase=grok_analysis",
        request_id,
        source,
        mode,
    )

    degraded = False
    warning: str | None = None
    analysis: MemoryAnalysis

    try:
        analysis = await grok.analyze_screenshot(
            image_bytes=image_bytes,
            content_type=content_type,
            mode=mode,
            question=question,
            source=source,
            captured_at=captured_at,
            allow_tools=True,
        )
    except GrokError as exc:
        logger.error(
            "capture grok_failed request_id=%s timeout=%s",
            request_id,
            exc.timeout,
        )
        # Graceful degradation: still attempt a minimal save so demo doesn't lose the shot.
        degraded = True
        warning = (
            "Grok analysis is temporarily unavailable. Screenshot saved with minimal metadata."
            if not exc.timeout
            else "Grok timed out. Screenshot saved with minimal metadata."
        )
        analysis = MemoryAnalysis(
            title="Screenshot (analysis pending)",
            content_type="other",
            intent_mode="REMEMBER",
            intent_summary="Captured while analysis was unavailable.",
            description="Screenshot saved; full understanding will require retry.",
            searchable_text=f"Screenshot from {source or 'unknown'}. Question: {question or ''}",
            tags=["unanalyzed"],
            actionable=False,
            urgency="none",
            needs_live_search=False,
            confidence=0.2,
            answer=None,
            short_message=warning,
            agent_activity=AgentActivity(
                steps=["Screenshot received", "Analysis unavailable"],
                notes=str(exc),
            ),
        )

    # If model wanted live search but tools appear unused / failed, soft-warn.
    if analysis.needs_live_search and not (
        analysis.agent_activity.web_search_used or analysis.agent_activity.x_search_used
    ):
        if not warning:
            warning = (
                "Screenshot understood and saved. Live verification is temporarily unavailable."
            )
            degraded = True
            analysis.agent_activity.live_verification_failed = True
            if "Live verification unavailable" not in analysis.agent_activity.steps:
                analysis.agent_activity.steps.append("Live verification unavailable")

    metadata: dict[str, Any] = {
        "title": analysis.title,
        "content_type": analysis.content_type,
        "intent_mode": analysis.intent_mode,
        "intent_summary": analysis.intent_summary,
        "description": analysis.description,
        "tags": analysis.tags,
        "entities": [e.model_dump() for e in analysis.entities],
        "actionable": analysis.actionable,
        "urgency": analysis.urgency,
        "captured_at": captured_at,
        "source": source,
        "confidence": analysis.confidence,
        "event": analysis.event.model_dump() if analysis.event else None,
        "person_followup": analysis.person_followup.model_dump() if analysis.person_followup else None,
        "place": analysis.place.model_dump() if analysis.place else None,
        "product": analysis.product.model_dump() if analysis.product else None,
        "temporal": analysis.temporal.model_dump() if analysis.temporal else None,
        "question": question,
        "answer": analysis.answer,
        "citations": [c.model_dump() for c in analysis.citations],
        "suggested_actions": [a.model_dump(mode="json") for a in analysis.suggested_actions],
        "analysis": analysis.model_dump(mode="json"),
        "agent_activity": analysis.agent_activity.model_dump(),
    }

    logger.info(
        "capture phase=memory_save request_id=%s web_search=%s x_search=%s",
        request_id,
        analysis.agent_activity.web_search_used,
        analysis.agent_activity.x_search_used,
    )

    try:
        saved = await store.save_memory(
            user_id=settings.demo_user_id,
            image_bytes=image_bytes,
            content_type=content_type,
            metadata=metadata,
            searchable_text=analysis.searchable_text,
            client_request_id=client_request_id,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("memory_save_failed request_id=%s err=%s", request_id, type(exc).__name__)
        raise

    short_message = analysis.short_message or analysis.answer or f"Saved: {analysis.title}"
    response = CaptureResponse(
        memory_id=saved["memory_id"],
        short_message=short_message,
        answer=analysis.answer,
        analysis=analysis,
        suggested_actions=analysis.suggested_actions,
        citations=analysis.citations,
        image_url=saved.get("image_url"),
        agent_activity=analysis.agent_activity.model_dump(),
        duplicate=bool(saved.get("duplicate")),
        degraded=degraded,
        warning=warning,
    )

    idempotency.store_response(client_request_id, response.model_dump(mode="json"))
    logger.info(
        "capture done request_id=%s memory_id=%s",
        request_id,
        response.memory_id,
    )
    return response
