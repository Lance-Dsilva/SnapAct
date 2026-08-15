"""MemoryStore adapter — sole gateway to teammate Supabase HTTP service.

If MEMORY_*_ENDPOINT env vars are unset, an in-memory mock is used so SnapAct
remains fully demoable. Plug real endpoints in without changing call sites.
"""

from __future__ import annotations

import base64
import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from config import Settings, get_settings
from schemas.memory import MemoryRecord, MemorySearchHit

logger = logging.getLogger("snapact.memory_store")


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryStore:
    """HTTP adapter + mock fallback for screenshot memory persistence."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._mock_lock = threading.Lock()
        self._mock_memories: dict[str, MemoryRecord] = {}
        self._seed_demo_data()

    @property
    def using_remote(self) -> bool:
        return self.settings.using_remote_memory

    async def save_memory(
        self,
        *,
        user_id: str,
        image_bytes: bytes,
        content_type: str,
        metadata: dict[str, Any],
        searchable_text: str,
        client_request_id: str | None = None,
    ) -> dict[str, Any]:
        if self.settings.memory_save_endpoint:
            return await self._remote_save(
                user_id=user_id,
                image_bytes=image_bytes,
                content_type=content_type,
                metadata=metadata,
                searchable_text=searchable_text,
                client_request_id=client_request_id,
            )
        return self._mock_save(
            user_id=user_id,
            image_bytes=image_bytes,
            content_type=content_type,
            metadata=metadata,
            searchable_text=searchable_text,
            client_request_id=client_request_id,
        )

    async def search_memories(
        self,
        *,
        user_id: str,
        query: str,
        top_k: int = 8,
        filters: dict[str, Any] | None = None,
    ) -> list[MemorySearchHit]:
        if self.settings.memory_search_endpoint:
            return await self._remote_search(
                user_id=user_id,
                query=query,
                top_k=top_k,
                filters=filters or {},
            )
        return self._mock_search(user_id=user_id, query=query, top_k=top_k, filters=filters or {})

    async def list_recent(
        self,
        *,
        user_id: str,
        limit: int = 40,
        filters: dict[str, Any] | None = None,
    ) -> list[MemoryRecord]:
        # TODO(teammate): Plug MEMORY_LIST_ENDPOINT when available.
        # Homepage + proactive feed need list/get/update beyond save+search.
        if self.settings.memory_list_endpoint:
            return await self._remote_list(user_id=user_id, limit=limit, filters=filters or {})
        return self._mock_list(user_id=user_id, limit=limit, filters=filters or {})

    async def get_memory(self, *, user_id: str, memory_id: str) -> MemoryRecord | None:
        # TODO(teammate): Plug MEMORY_GET_ENDPOINT when available.
        if self.settings.memory_get_endpoint:
            return await self._remote_get(user_id=user_id, memory_id=memory_id)
        return self._mock_get(user_id=user_id, memory_id=memory_id)

    async def update_memory(
        self,
        *,
        user_id: str,
        memory_id: str,
        patch: dict[str, Any],
    ) -> MemoryRecord | None:
        # TODO(teammate): Plug MEMORY_UPDATE_ENDPOINT when available.
        if self.settings.memory_update_endpoint:
            return await self._remote_update(user_id=user_id, memory_id=memory_id, patch=patch)
        return self._mock_update(user_id=user_id, memory_id=memory_id, patch=patch)

    # --- Remote HTTP ---

    async def _remote_save(
        self,
        *,
        user_id: str,
        image_bytes: bytes,
        content_type: str,
        metadata: dict[str, Any],
        searchable_text: str,
        client_request_id: str | None,
    ) -> dict[str, Any]:
        # TODO(teammate): Confirm multipart field names / JSON wrapper for your gateway.
        files = {
            "image": ("screenshot.png", image_bytes, content_type),
        }
        data = {
            "user_id": user_id,
            "metadata": _json_dumps(metadata),
            "searchable_text": searchable_text,
        }
        if client_request_id:
            data["client_request_id"] = client_request_id

        async with httpx.AsyncClient(timeout=self.settings.memory_http_timeout_seconds) as client:
            resp = await client.post(
                self.settings.memory_save_endpoint,
                data=data,
                files=files,
            )
            resp.raise_for_status()
            payload = resp.json()

        # Also keep a local mirror for list/get if those endpoints are missing.
        memory_id = payload.get("memory_id") or f"mem_{uuid.uuid4().hex[:10]}"
        record = MemoryRecord(
            memory_id=memory_id,
            user_id=user_id,
            image_url=payload.get("image_url"),
            created_at=payload.get("created_at") or _utcnow(),
            searchable_text=searchable_text,
            metadata=metadata,
            analysis=metadata.get("analysis"),
            source=metadata.get("source"),
            captured_at=metadata.get("captured_at"),
            question=metadata.get("question"),
            client_request_id=client_request_id,
        )
        if isinstance(record.analysis, dict):
            from schemas.memory import MemoryAnalysis

            record.analysis = MemoryAnalysis.model_validate(record.analysis)
        with self._mock_lock:
            self._mock_memories[memory_id] = record
        return {
            "memory_id": memory_id,
            "image_url": record.image_url,
            "created_at": record.created_at,
        }

    async def _remote_search(
        self,
        *,
        user_id: str,
        query: str,
        top_k: int,
        filters: dict[str, Any],
    ) -> list[MemorySearchHit]:
        body = {
            "user_id": user_id,
            "query": query,
            "top_k": top_k,
            "filters": filters,
        }
        async with httpx.AsyncClient(timeout=self.settings.memory_http_timeout_seconds) as client:
            resp = await client.post(self.settings.memory_search_endpoint, json=body)
            resp.raise_for_status()
            payload = resp.json()

        results: list[MemorySearchHit] = []
        for item in payload.get("results", []):
            mid = item.get("memory_id")
            local = self._mock_memories.get(mid) if mid else None
            results.append(
                MemorySearchHit(
                    memory_id=mid,
                    score=float(item.get("score", 0.0)),
                    image_url=item.get("image_url") or (local.image_url if local else None),
                    metadata=item.get("metadata") or (local.metadata if local else {}),
                    analysis=local.analysis if local else None,
                )
            )
        return results

    async def _remote_list(
        self,
        *,
        user_id: str,
        limit: int,
        filters: dict[str, Any],
    ) -> list[MemoryRecord]:
        async with httpx.AsyncClient(timeout=self.settings.memory_http_timeout_seconds) as client:
            resp = await client.get(
                self.settings.memory_list_endpoint,
                params={"user_id": user_id, "limit": limit, **filters},
            )
            resp.raise_for_status()
            payload = resp.json()
        items = payload.get("memories") or payload.get("results") or payload
        out: list[MemoryRecord] = []
        for item in items:
            out.append(MemoryRecord.model_validate(item))
        return out[:limit]

    async def _remote_get(self, *, user_id: str, memory_id: str) -> MemoryRecord | None:
        url = self.settings.memory_get_endpoint.rstrip("/")
        if "{memory_id}" in url:
            url = url.replace("{memory_id}", memory_id)
        else:
            url = f"{url}/{memory_id}"
        async with httpx.AsyncClient(timeout=self.settings.memory_http_timeout_seconds) as client:
            resp = await client.get(url, params={"user_id": user_id})
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return MemoryRecord.model_validate(resp.json())

    async def _remote_update(
        self,
        *,
        user_id: str,
        memory_id: str,
        patch: dict[str, Any],
    ) -> MemoryRecord | None:
        url = self.settings.memory_update_endpoint.rstrip("/")
        if "{memory_id}" in url:
            url = url.replace("{memory_id}", memory_id)
        else:
            url = f"{url}/{memory_id}"
        async with httpx.AsyncClient(timeout=self.settings.memory_http_timeout_seconds) as client:
            resp = await client.patch(url, json={"user_id": user_id, **patch})
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return MemoryRecord.model_validate(resp.json())

    # --- Mock store ---

    def _mock_save(
        self,
        *,
        user_id: str,
        image_bytes: bytes,
        content_type: str,
        metadata: dict[str, Any],
        searchable_text: str,
        client_request_id: str | None,
    ) -> dict[str, Any]:
        if client_request_id:
            with self._mock_lock:
                for mem in self._mock_memories.values():
                    if mem.client_request_id == client_request_id and mem.user_id == user_id:
                        return {
                            "memory_id": mem.memory_id,
                            "image_url": mem.image_url,
                            "created_at": mem.created_at,
                            "duplicate": True,
                        }

        memory_id = f"mem_{uuid.uuid4().hex[:10]}"
        b64 = base64.b64encode(image_bytes).decode("ascii")
        image_url = f"data:{content_type};base64,{b64}"
        analysis = metadata.get("analysis")
        from schemas.memory import MemoryAnalysis

        analysis_obj = None
        if isinstance(analysis, MemoryAnalysis):
            analysis_obj = analysis
        elif isinstance(analysis, dict):
            analysis_obj = MemoryAnalysis.model_validate(analysis)

        now = _utcnow()
        record = MemoryRecord(
            memory_id=memory_id,
            user_id=user_id,
            image_url=image_url,
            created_at=now,
            updated_at=now,
            searchable_text=searchable_text,
            metadata={**metadata, "analysis": analysis_obj.model_dump(mode="json") if analysis_obj else metadata.get("analysis")},
            analysis=analysis_obj,
            source=metadata.get("source"),
            captured_at=metadata.get("captured_at"),
            question=metadata.get("question"),
            client_request_id=client_request_id,
        )
        with self._mock_lock:
            self._mock_memories[memory_id] = record
        logger.info("mock_save memory_id=%s user_id=%s", memory_id, user_id)
        return {
            "memory_id": memory_id,
            "image_url": image_url,
            "created_at": now,
        }

    def _mock_search(
        self,
        *,
        user_id: str,
        query: str,
        top_k: int,
        filters: dict[str, Any],
    ) -> list[MemorySearchHit]:
        tokens = [t.lower() for t in query.split() if len(t) > 1]
        hits: list[tuple[float, MemoryRecord]] = []
        with self._mock_lock:
            memories = list(self._mock_memories.values())
        for mem in memories:
            if mem.user_id != user_id:
                continue
            if filters.get("content_type") and mem.metadata.get("content_type") != filters["content_type"]:
                continue
            blob = " ".join(
                [
                    mem.searchable_text,
                    mem.metadata.get("title", ""),
                    " ".join(mem.metadata.get("tags") or []),
                    str(mem.metadata.get("description", "")),
                ]
            ).lower()
            if not tokens:
                score = 0.1
            else:
                matched = sum(1 for t in tokens if t in blob)
                score = matched / len(tokens)
                if mem.metadata.get("content_type") and mem.metadata["content_type"] in query.lower():
                    score += 0.15
            if score > 0:
                hits.append((score, mem))
        hits.sort(key=lambda x: x[0], reverse=True)
        return [
            MemorySearchHit(
                memory_id=mem.memory_id,
                score=round(score, 4),
                image_url=mem.image_url,
                metadata=mem.metadata,
                analysis=mem.analysis,
            )
            for score, mem in hits[:top_k]
        ]

    def _mock_list(
        self,
        *,
        user_id: str,
        limit: int,
        filters: dict[str, Any],
    ) -> list[MemoryRecord]:
        with self._mock_lock:
            items = [m for m in self._mock_memories.values() if m.user_id == user_id]
        content_type = filters.get("content_type")
        if content_type and content_type != "all":
            items = [
                m
                for m in items
                if (m.analysis.content_type if m.analysis else m.metadata.get("content_type"))
                == content_type
            ]
        items.sort(key=lambda m: m.created_at, reverse=True)
        return items[:limit]

    def _mock_get(self, *, user_id: str, memory_id: str) -> MemoryRecord | None:
        with self._mock_lock:
            mem = self._mock_memories.get(memory_id)
        if not mem or mem.user_id != user_id:
            return None
        return mem

    def _mock_update(
        self,
        *,
        user_id: str,
        memory_id: str,
        patch: dict[str, Any],
    ) -> MemoryRecord | None:
        with self._mock_lock:
            mem = self._mock_memories.get(memory_id)
            if not mem or mem.user_id != user_id:
                return None
            data = mem.model_dump()
            if "completed" in patch:
                data["completed"] = bool(patch["completed"])
                if data.get("analysis") and isinstance(data["analysis"], dict):
                    pf = data["analysis"].get("person_followup")
                    if isinstance(pf, dict):
                        pf["completed"] = data["completed"]
            data["updated_at"] = _utcnow()
            data["metadata"] = {**data.get("metadata", {}), **patch.get("metadata", {})}
            updated = MemoryRecord.model_validate(data)
            self._mock_memories[memory_id] = updated
            return updated

    def _seed_demo_data(self) -> None:
        """Seed distinguishable mock memories for homepage demo."""
        from schemas.memory import (
            AgentActivity,
            Entity,
            EventMetadata,
            FollowUpMetadata,
            MemoryAnalysis,
            PlaceMetadata,
            SuggestedAction,
            TemporalMetadata,
        )

        seeds: list[tuple[str, MemoryAnalysis, str]] = [
            (
                "mem_demo_event",
                MemoryAnalysis(
                    title="Cursor × Grok Hackathon",
                    content_type="event",
                    intent_mode="ACT",
                    intent_summary="User may want to attend this hackathon.",
                    description="AI hackathon in Austin focused on Grok 4.6 and agents.",
                    searchable_text=(
                        "Cursor Grok AI hackathon in Austin. Developer event about Grok 4.6, "
                        "agents and AI tools. User likely captured this because they may want "
                        "to attend. Category: event. Intent: ACT. Location: Austin Texas."
                    ),
                    tags=["AI", "hackathon", "Austin", "Grok", "developer"],
                    entities=[
                        Entity(name="Cursor", type="company"),
                        Entity(name="Austin", type="location"),
                        Entity(name="Grok", type="product"),
                    ],
                    extracted_text_summary="Cursor × Grok Hackathon — Austin — Aug 22",
                    actionable=True,
                    urgency="high",
                    needs_live_search=True,
                    suggested_actions=[
                        SuggestedAction(type="register", label="Register", reason="Event approaching"),
                        SuggestedAction(type="add_calendar", label="Add to Calendar"),
                    ],
                    temporal=TemporalMetadata(
                        event_date="2026-08-22",
                        is_upcoming=True,
                        relative_summary="Upcoming this month",
                    ),
                    event=EventMetadata(
                        name="Cursor × Grok Hackathon",
                        date="2026-08-22",
                        location="Austin, TX",
                        organizer="Cursor × xAI",
                    ),
                    confidence=0.93,
                    short_message="Saved Cursor × Grok Hackathon in Austin as an actionable event.",
                    agent_activity=AgentActivity(
                        steps=["Screenshot understood", "Event identified"],
                        web_search_used=False,
                        x_search_used=False,
                    ),
                ),
                "demo-seed",
            ),
            (
                "mem_demo_quote_1",
                MemoryAnalysis(
                    title="Stay hungry, stay foolish",
                    content_type="quote",
                    intent_mode="REMEMBER",
                    intent_summary="User wants to remember this quote.",
                    description="Classic Steve Jobs quote about curiosity and ambition.",
                    searchable_text=(
                        "Stay hungry stay foolish quote. Inspiration about ambition. "
                        "Category: quote. Intent: REMEMBER."
                    ),
                    tags=["quote", "inspiration", "Jobs"],
                    entities=[Entity(name="Steve Jobs", type="person")],
                    actionable=False,
                    urgency="none",
                    needs_live_search=False,
                    suggested_actions=[SuggestedAction(type="save", label="Saved")],
                    confidence=0.96,
                    short_message="Saved quote: Stay hungry, stay foolish.",
                    agent_activity=AgentActivity(
                        steps=["Screenshot understood", "Quote identified"],
                        web_search_used=False,
                    ),
                ),
                "demo-seed",
            ),
            (
                "mem_demo_quote_2",
                MemoryAnalysis(
                    title="Execution eats strategy",
                    content_type="quote",
                    intent_mode="REMEMBER",
                    intent_summary="User saved a quote about execution.",
                    description="Short reminder that shipping beats planning theater.",
                    searchable_text="Execution eats strategy quote about shipping. Category: quote. Intent: REMEMBER.",
                    tags=["quote", "execution"],
                    actionable=False,
                    urgency="none",
                    needs_live_search=False,
                    confidence=0.9,
                    short_message="Saved quote about execution.",
                    agent_activity=AgentActivity(steps=["Screenshot understood", "Quote identified"]),
                ),
                "demo-seed",
            ),
            (
                "mem_demo_followup",
                MemoryAnalysis(
                    title="Follow up with Sarah",
                    content_type="person_followup",
                    intent_mode="ACT",
                    intent_summary="User wants to follow up about a referral.",
                    description="Note to contact Sarah about a referral conversation.",
                    searchable_text=(
                        "Follow up with Sarah about referral. People follow-up. "
                        "Category: person_followup. Intent: ACT."
                    ),
                    tags=["people", "referral", "follow-up"],
                    entities=[Entity(name="Sarah", type="person")],
                    actionable=True,
                    urgency="medium",
                    needs_live_search=False,
                    suggested_actions=[
                        SuggestedAction(type="follow_up", label="Follow up", reason="Referral conversation"),
                    ],
                    person_followup=FollowUpMetadata(
                        person_name="Sarah",
                        topic="referral",
                        due_hint="this week",
                    ),
                    confidence=0.88,
                    short_message="Saved follow-up with Sarah about referral.",
                    agent_activity=AgentActivity(steps=["Screenshot understood", "Follow-up identified"]),
                ),
                "demo-seed",
            ),
            (
                "mem_demo_place",
                MemoryAnalysis(
                    title="Franklin Barbecue",
                    content_type="place",
                    intent_mode="EXPLORE",
                    intent_summary="User is considering this restaurant.",
                    description="Austin BBQ spot the user may want to visit.",
                    searchable_text=(
                        "Franklin Barbecue restaurant in Austin Texas. Place to visit. "
                        "Category: place. Intent: EXPLORE."
                    ),
                    tags=["restaurant", "Austin", "BBQ"],
                    entities=[
                        Entity(name="Franklin Barbecue", type="place"),
                        Entity(name="Austin", type="location"),
                    ],
                    actionable=True,
                    urgency="low",
                    needs_live_search=False,
                    place=PlaceMetadata(
                        name="Franklin Barbecue",
                        city="Austin",
                        category="restaurant",
                    ),
                    suggested_actions=[SuggestedAction(type="research", label="Explore")],
                    confidence=0.87,
                    short_message="Saved Franklin Barbecue as a place to explore.",
                    agent_activity=AgentActivity(steps=["Screenshot understood", "Place identified"]),
                ),
                "demo-seed",
            ),
            (
                "mem_demo_knowledge",
                MemoryAnalysis(
                    title="Grok Responses API notes",
                    content_type="knowledge",
                    intent_mode="REMEMBER",
                    intent_summary="User saved API documentation notes.",
                    description="Notes about xAI Responses API multimodal inputs and tools.",
                    searchable_text=(
                        "Grok Responses API knowledge notes about input_image web_search x_search. "
                        "Category: knowledge. Intent: REMEMBER."
                    ),
                    tags=["Grok", "API", "knowledge"],
                    actionable=False,
                    urgency="none",
                    needs_live_search=False,
                    confidence=0.85,
                    short_message="Saved Grok API knowledge notes.",
                    agent_activity=AgentActivity(steps=["Screenshot understood", "Knowledge captured"]),
                ),
                "demo-seed",
            ),
        ]

        now = _utcnow()
        placeholder = (
            "data:image/svg+xml;base64,"
            + base64.b64encode(
                b'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">'
                b'<rect fill="#e8f4f2" width="100%" height="100%"/>'
                b'<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" '
                b'fill="#0f766e" font-family="sans-serif" font-size="28">SnapAct demo</text>'
                b"</svg>"
            ).decode("ascii")
        )
        with self._mock_lock:
            for memory_id, analysis, source in seeds:
                if memory_id in self._mock_memories:
                    continue
                self._mock_memories[memory_id] = MemoryRecord(
                    memory_id=memory_id,
                    user_id=self.settings.demo_user_id,
                    image_url=placeholder,
                    created_at=now,
                    searchable_text=analysis.searchable_text,
                    metadata={
                        "title": analysis.title,
                        "content_type": analysis.content_type,
                        "intent_mode": analysis.intent_mode,
                        "description": analysis.description,
                        "tags": analysis.tags,
                        "demo_seed": True,
                        "analysis": analysis.model_dump(mode="json"),
                    },
                    analysis=analysis,
                    source=source,
                    captured_at=now,
                )


def _json_dumps(obj: Any) -> str:
    import json

    return json.dumps(obj, default=str)


_store: MemoryStore | None = None


def get_memory_store() -> MemoryStore:
    global _store
    if _store is None:
        _store = MemoryStore()
    return _store


def reset_memory_store_for_tests() -> MemoryStore:
    global _store
    _store = MemoryStore()
    return _store
