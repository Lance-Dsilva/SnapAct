from fastapi import APIRouter, HTTPException

from config import get_settings
from schemas.api import AskRequest, AskResponse, SearchResultItem
from services.grok import GrokError, get_grok_service
from services.memory_store import get_memory_store

router = APIRouter(tags=["ask"])


@router.post("/ask", response_model=AskResponse)
async def ask(body: AskRequest) -> AskResponse:
    settings = get_settings()
    store = get_memory_store()
    grok = get_grok_service()

    try:
        hits = await store.search_memories(
            user_id=settings.demo_user_id,
            query=body.question,
            top_k=body.top_k,
            filters={},
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail="Could not retrieve memories for this question.",
        ) from exc

    memory_cards: list[SearchResultItem] = []
    compact = []
    for hit in hits:
        meta = hit.metadata or {}
        analysis = hit.analysis
        card = SearchResultItem(
            memory_id=hit.memory_id,
            title=(analysis.title if analysis else None) or meta.get("title") or hit.memory_id,
            description=(analysis.description if analysis else None)
            or meta.get("description")
            or "",
            image_url=hit.image_url,
            content_type=(analysis.content_type if analysis else None)
            or meta.get("content_type")
            or "other",
            intent_mode=(analysis.intent_mode if analysis else None)
            or meta.get("intent_mode")
            or "REMEMBER",
            score=hit.score,
            tags=(analysis.tags if analysis else None) or meta.get("tags") or [],
            metadata=meta,
        )
        memory_cards.append(card)
        compact.append(
            {
                "memory_id": card.memory_id,
                "title": card.title,
                "description": card.description,
                "content_type": card.content_type,
                "intent_mode": card.intent_mode,
                "tags": card.tags,
                "score": card.score,
            }
        )

    try:
        synthesized = await grok.ask_across_memories(
            question=body.question,
            memories=compact,
            allow_tools=True,
        )
    except GrokError as exc:
        # Still return retrieved memories if synthesis fails.
        fallback = (
            "I found related screenshots, but answer synthesis is temporarily unavailable."
        )
        return AskResponse(
            answer=fallback,
            short_message=fallback,
            memories=memory_cards,
            citations=[],
        )

    return AskResponse(
        answer=synthesized.get("answer") or "",
        short_message=synthesized.get("short_message"),
        memories=memory_cards,
        citations=synthesized.get("citations") or [],
    )
