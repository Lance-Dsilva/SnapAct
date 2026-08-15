from fastapi import APIRouter

from config import get_settings
from schemas.api import HealthResponse
from services.memory_store import get_memory_store

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    store = get_memory_store()
    return HealthResponse(
        status="ok",
        service="snapact",
        grok_configured=settings.grok_configured,
        memory_store_configured=settings.memory_store_configured,
        using_remote_memory=store.using_remote,
        demo_user_id=settings.demo_user_id,
    )
