from fastapi import APIRouter, HTTPException, Query

from config import get_settings
from schemas.api import CompleteMemoryRequest, MemoriesListResponse
from services.memory_store import get_memory_store

router = APIRouter(tags=["memories"])


def _serialize_memory(mem) -> dict:
    analysis = mem.analysis.model_dump(mode="json") if mem.analysis else mem.metadata.get("analysis")
    return {
        "memory_id": mem.memory_id,
        "user_id": mem.user_id,
        "image_url": mem.image_url,
        "created_at": mem.created_at,
        "updated_at": mem.updated_at,
        "searchable_text": mem.searchable_text,
        "metadata": mem.metadata,
        "analysis": analysis,
        "source": mem.source,
        "captured_at": mem.captured_at,
        "question": mem.question,
        "completed": mem.completed,
        "demo_seed": bool(mem.metadata.get("demo_seed")),
        "title": (mem.analysis.title if mem.analysis else None)
        or mem.metadata.get("title")
        or mem.memory_id,
        "content_type": (mem.analysis.content_type if mem.analysis else None)
        or mem.metadata.get("content_type")
        or "other",
        "intent_mode": (mem.analysis.intent_mode if mem.analysis else None)
        or mem.metadata.get("intent_mode")
        or "REMEMBER",
        "description": (mem.analysis.description if mem.analysis else None)
        or mem.metadata.get("description")
        or "",
        "tags": (mem.analysis.tags if mem.analysis else None) or mem.metadata.get("tags") or [],
    }


@router.get("/memories", response_model=MemoriesListResponse)
async def list_memories(
    limit: int = Query(40, ge=1, le=100),
    content_type: str | None = Query(None),
) -> MemoriesListResponse:
    settings = get_settings()
    store = get_memory_store()
    filters = {}
    if content_type:
        filters["content_type"] = content_type
    try:
        memories = await store.list_recent(
            user_id=settings.demo_user_id,
            limit=limit,
            filters=filters,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="Could not list memories.") from exc

    return MemoriesListResponse(
        memories=[_serialize_memory(m) for m in memories],
        source="api" if store.using_remote else "mock",
    )


@router.get("/memories/{memory_id}")
async def get_memory(memory_id: str) -> dict:
    settings = get_settings()
    store = get_memory_store()
    mem = await store.get_memory(user_id=settings.demo_user_id, memory_id=memory_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return _serialize_memory(mem)


@router.post("/memories/{memory_id}/complete")
async def complete_memory(memory_id: str, body: CompleteMemoryRequest) -> dict:
    settings = get_settings()
    store = get_memory_store()
    mem = await store.update_memory(
        user_id=settings.demo_user_id,
        memory_id=memory_id,
        patch={"completed": body.completed},
    )
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found.")
    return _serialize_memory(mem)
