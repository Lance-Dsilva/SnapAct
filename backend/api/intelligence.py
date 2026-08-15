from fastapi import APIRouter, HTTPException

from config import get_settings
from schemas.memory import HomeFeedPlan
from services.feed_service import refresh_home_feed
from services.memory_store import get_memory_store

router = APIRouter(tags=["intelligence"])


@router.post("/intelligence/refresh", response_model=HomeFeedPlan)
async def intelligence_refresh() -> HomeFeedPlan:
    settings = get_settings()
    store = get_memory_store()
    try:
        memories = await store.list_recent(user_id=settings.demo_user_id, limit=50, filters={})
        # Prefer actionable + recent mix for ranking
        return await refresh_home_feed(memories)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail="Intelligence refresh failed.",
        ) from exc


@router.post("/jobs/refresh-feed", response_model=HomeFeedPlan)
async def jobs_refresh_feed() -> HomeFeedPlan:
    """Scheduler-friendly alias (Vercel Cron / manual). Same as intelligence/refresh."""
    return await intelligence_refresh()
