from fastapi import APIRouter, HTTPException

from config import get_settings
from schemas.api import SearchRequest, SearchResponse, SearchResultItem
from services.memory_store import get_memory_store

router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def search(body: SearchRequest) -> SearchResponse:
    settings = get_settings()
    store = get_memory_store()
    try:
        hits = await store.search_memories(
            user_id=settings.demo_user_id,
            query=body.query,
            top_k=body.top_k,
            filters=body.filters,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail="Memory search is temporarily unavailable.",
        ) from exc

    results: list[SearchResultItem] = []
    for hit in hits:
        meta = hit.metadata or {}
        analysis = hit.analysis
        results.append(
            SearchResultItem(
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
        )
    return SearchResponse(query=body.query, results=results)
