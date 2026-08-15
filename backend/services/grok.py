"""xAI Grok 4.6 client via the Responses API."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import httpx

from config import Settings, get_settings
from prompts.memory_ask import MEMORY_ASK_SYSTEM, build_memory_ask_prompt
from prompts.feed_refresh import FEED_REFRESH_SYSTEM, build_feed_refresh_prompt
from prompts.screenshot_analysis import (
    MEMORY_ANALYSIS_JSON_HINT,
    SCREENSHOT_ANALYSIS_SYSTEM,
    build_screenshot_user_prompt,
)
from schemas.memory import (
    AgentActivity,
    Citation,
    MemoryAnalysis,
    SuggestedAction,
)

logger = logging.getLogger("snapact.grok")


class GrokError(Exception):
    """Raised when Grok request fails in a recoverable way."""

    def __init__(self, message: str, *, timeout: bool = False) -> None:
        super().__init__(message)
        self.timeout = timeout


class GrokService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    @property
    def configured(self) -> bool:
        return self.settings.grok_configured

    async def analyze_screenshot(
        self,
        *,
        image_bytes: bytes,
        content_type: str,
        mode: str,
        question: str | None = None,
        source: str | None = None,
        captured_at: str | None = None,
        allow_tools: bool = True,
    ) -> MemoryAnalysis:
        if self.settings.use_mock_grok or not (self.settings.xai_api_key and self.settings.xai_model):
            return self._mock_analyze(mode=mode, question=question)

        import base64

        b64 = base64.b64encode(image_bytes).decode("ascii")
        data_url = f"data:{content_type};base64,{b64}"
        user_text = build_screenshot_user_prompt(
            mode=mode,
            question=question,
            source=source,
            captured_at=captured_at,
        )
        user_text = f"{user_text}\n\n{MEMORY_ANALYSIS_JSON_HINT}"

        tools = [{"type": "web_search"}, {"type": "x_search"}] if allow_tools else []
        payload: dict[str, Any] = {
            "model": self.settings.xai_model,
            "store": False,
            "input": [
                {
                    "role": "system",
                    "content": SCREENSHOT_ANALYSIS_SYSTEM,
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_image",
                            "image_url": data_url,
                            "detail": "high",
                        },
                        {
                            "type": "input_text",
                            "text": user_text,
                        },
                    ],
                },
            ],
        }
        if tools:
            payload["tools"] = tools

        raw, meta = await self._create_response(payload)
        analysis = self._parse_memory_analysis(raw, meta)
        return analysis

    async def ask_across_memories(
        self,
        *,
        question: str,
        memories: list[dict[str, Any]],
        allow_tools: bool = True,
    ) -> dict[str, Any]:
        if self.settings.use_mock_grok or not (self.settings.xai_api_key and self.settings.xai_model):
            titles = [m.get("title") or m.get("memory_id") for m in memories[:3]]
            answer = (
                f"Based on your saved screenshots, here's what I found for “{question}”: "
                + (", ".join(str(t) for t in titles) if titles else "no matching memories yet.")
            )
            return {
                "answer": answer,
                "short_message": answer,
                "citations": [],
                "referenced_memory_ids": [m.get("memory_id") for m in memories if m.get("memory_id")],
            }

        memories_json = json.dumps(memories, default=str)[:24000]
        payload: dict[str, Any] = {
            "model": self.settings.xai_model,
            "store": False,
            "input": [
                {"role": "system", "content": MEMORY_ASK_SYSTEM},
                {
                    "role": "user",
                    "content": build_memory_ask_prompt(question, memories_json),
                },
            ],
        }
        if allow_tools:
            payload["tools"] = [{"type": "web_search"}, {"type": "x_search"}]

        raw, _meta = await self._create_response(payload)
        data = self._extract_json_object(raw)
        return {
            "answer": data.get("answer") or raw.strip(),
            "short_message": data.get("short_message") or data.get("answer") or raw.strip()[:280],
            "citations": [
                Citation.model_validate(c) if not isinstance(c, Citation) else c
                for c in (data.get("citations") or [])
                if isinstance(c, (dict, Citation))
            ],
            "referenced_memory_ids": data.get("referenced_memory_ids") or [],
        }

    async def refresh_feed_plan(
        self,
        *,
        memories: list[dict[str, Any]],
        ranked_hints: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if self.settings.use_mock_grok or not (self.settings.xai_api_key and self.settings.xai_model):
            return {
                "needs_attention": [
                    h
                    for h in ranked_hints
                    if h.get("bucket") == "needs_attention"
                ][:5],
                "upcoming_events": [h for h in ranked_hints if h.get("bucket") == "upcoming_events"][:5],
                "follow_ups": [h for h in ranked_hints if h.get("bucket") == "follow_ups"][:5],
                "suggested_explorations": [
                    h for h in ranked_hints if h.get("bucket") == "suggested_explorations"
                ][:5],
            }

        payload = {
            "model": self.settings.xai_model,
            "store": False,
            "input": [
                {"role": "system", "content": FEED_REFRESH_SYSTEM},
                {
                    "role": "user",
                    "content": build_feed_refresh_prompt(
                        json.dumps(memories, default=str)[:20000],
                        json.dumps(ranked_hints, default=str)[:8000],
                    ),
                },
            ],
        }
        raw, _meta = await self._create_response(payload)
        return self._extract_json_object(raw)

    async def _create_response(self, payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        url = f"{self.settings.xai_base_url.rstrip('/')}/responses"
        headers = {
            "Authorization": f"Bearer {self.settings.xai_api_key}",
            "Content-Type": "application/json",
        }
        started = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=self.settings.xai_timeout_seconds) as client:
                resp = await client.post(url, headers=headers, json=payload)
        except httpx.TimeoutException as exc:
            logger.error("Grok timeout after %.1fs", time.perf_counter() - started)
            raise GrokError("Grok timed out while analyzing.", timeout=True) from exc
        except httpx.HTTPError as exc:
            logger.error("Grok HTTP error: %s", type(exc).__name__)
            raise GrokError("Grok request failed.") from exc

        duration_ms = int((time.perf_counter() - started) * 1000)
        tool_meta = self._detect_tool_usage(resp_json=None, raw_text="")

        if resp.status_code >= 400:
            logger.error(
                "Grok error status=%s duration_ms=%s body_excerpt=%s",
                resp.status_code,
                duration_ms,
                (resp.text or "")[:300],
            )
            raise GrokError(f"Grok API error ({resp.status_code}).")

        data = resp.json()
        text = self._extract_output_text(data)
        tool_meta = self._detect_tool_usage(resp_json=data, raw_text=text)
        logger.info(
            "Grok ok duration_ms=%s web_search=%s x_search=%s",
            duration_ms,
            tool_meta["web_search_used"],
            tool_meta["x_search_used"],
        )
        return text, {"duration_ms": duration_ms, **tool_meta}

    def _extract_output_text(self, data: dict[str, Any]) -> str:
        # Responses API: output[] -> message -> content[] -> output_text
        chunks: list[str] = []
        for item in data.get("output") or []:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "message":
                for part in item.get("content") or []:
                    if isinstance(part, dict) and part.get("type") in {"output_text", "text"}:
                        chunks.append(part.get("text") or "")
            elif item.get("type") == "output_text" and item.get("text"):
                chunks.append(item["text"])
        if chunks:
            return "\n".join(chunks).strip()
        # Fallbacks used by some SDK shapes
        if isinstance(data.get("output_text"), str):
            return data["output_text"]
        if isinstance(data.get("content"), str):
            return data["content"]
        return json.dumps(data)

    def _detect_tool_usage(self, *, resp_json: dict[str, Any] | None, raw_text: str) -> dict[str, bool]:
        web = False
        x = False
        blob = raw_text.lower()
        if resp_json:
            dumped = json.dumps(resp_json).lower()
            if "web_search" in dumped or "server_side_tool_web_search" in dumped:
                web = True
            if "x_search" in dumped or "server_side_tool_x_search" in dumped:
                x = True
            usage = resp_json.get("server_side_tool_usage") or {}
            if isinstance(usage, dict):
                for key in usage:
                    lk = str(key).lower()
                    if "web" in lk:
                        web = True
                    if lk.startswith("x_") or "x_search" in lk:
                        x = True
        return {"web_search_used": web, "x_search_used": x}

    def _parse_memory_analysis(self, raw: str, meta: dict[str, Any]) -> MemoryAnalysis:
        data = self._extract_json_object(raw)
        try:
            analysis = MemoryAnalysis.model_validate(data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Malformed Grok JSON, attempting salvage: %s", type(exc).__name__)
            analysis = self._salvage_analysis(data, raw)

        # Prefer observed tool usage from response metadata over model claims when present.
        if meta.get("web_search_used"):
            analysis.agent_activity.web_search_used = True
            analysis.agent_activity.live_verification = True
        if meta.get("x_search_used"):
            analysis.agent_activity.x_search_used = True
            analysis.agent_activity.live_verification = True

        # Never invent empty steps — ensure baseline activity.
        if not analysis.agent_activity.steps:
            analysis.agent_activity.steps = ["Screenshot understood"]
            if analysis.content_type == "event":
                analysis.agent_activity.steps.append("Event identified")
            if analysis.agent_activity.web_search_used:
                analysis.agent_activity.steps.append("Web searched")
            if analysis.agent_activity.x_search_used:
                analysis.agent_activity.steps.append("X searched")

        return analysis

    def _salvage_analysis(self, data: dict[str, Any], raw: str) -> MemoryAnalysis:
        return MemoryAnalysis(
            title=str(data.get("title") or "Screenshot memory"),
            content_type=data.get("content_type") or "other",
            intent_mode=data.get("intent_mode") or "REMEMBER",
            intent_summary=str(data.get("intent_summary") or "Captured for later."),
            description=str(data.get("description") or raw[:500]),
            searchable_text=str(data.get("searchable_text") or data.get("description") or raw[:1000]),
            tags=list(data.get("tags") or []),
            actionable=bool(data.get("actionable", False)),
            urgency=data.get("urgency") or "none",
            needs_live_search=bool(data.get("needs_live_search", False)),
            confidence=float(data.get("confidence") or 0.4),
            answer=data.get("answer"),
            short_message=data.get("short_message") or str(data.get("title") or "Saved screenshot."),
            agent_activity=AgentActivity(
                steps=["Screenshot understood", "Structured parsing partially recovered"],
                notes="Model response required salvage parsing.",
            ),
        )

    def _extract_json_object(self, text: str) -> dict[str, Any]:
        text = text.strip()
        if not text:
            return {}
        try:
            obj = json.loads(text)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
        fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if fence:
            try:
                obj = json.loads(fence.group(1))
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError:
                pass
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                obj = json.loads(text[start : end + 1])
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError:
                pass
        return {"answer": text, "description": text, "title": "Screenshot", "searchable_text": text}

    def _mock_analyze(self, *, mode: str, question: str | None) -> MemoryAnalysis:
        """Deterministic offline analysis for tests / missing API keys."""
        q = (question or "").lower()
        if "event" in q or "austin" in q or "similar" in q:
            return MemoryAnalysis(
                title="AI Hackathon Austin",
                content_type="event",
                intent_mode="ACT",
                intent_summary="User may want to attend or find similar events.",
                description="Event screenshot related to an AI hackathon in Austin.",
                searchable_text=(
                    "AI Hackathon Austin August developer event. Category: event. Intent: ACT. "
                    "Location: Austin Texas."
                ),
                tags=["AI", "hackathon", "Austin"],
                actionable=True,
                urgency="high",
                needs_live_search=True,
                suggested_actions=[
                    SuggestedAction(type="research", label="Find similar events"),
                    SuggestedAction(type="add_calendar", label="Add to Calendar"),
                ],
                confidence=0.8,
                answer=(
                    "I found similar AI builder events in Austin you may like: "
                    "AI Builders Austin, Agent Hack Night, and Austin ML Meetup."
                    if mode == "ask"
                    else None
                ),
                short_message=(
                    "I found 3 similar AI events in Austin: AI Builders Austin, Agent Hack Night, and Austin ML Meetup."
                    if mode == "ask"
                    else "Saved AI Hackathon Austin as an actionable event."
                ),
                citations=[
                    Citation(
                        title="AI Builders Austin",
                        url="https://example.com/ai-builders-austin",
                        source="web",
                        snippet="Local AI meetup",
                    )
                ]
                if mode == "ask"
                else [],
                agent_activity=AgentActivity(
                    steps=[
                        "Screenshot understood",
                        "Event identified",
                        "Live information required",
                        "Web searched",
                        "Current details verified",
                    ],
                    web_search_used=True,
                    live_verification=True,
                ),
            )

        if "quote" in q or "hungry" in q or "foolish" in q or (
            mode == "save" and "event" not in q and "austin" not in q
        ):
            # Default save path leans REMEMBER quote unless event keywords present.
            return MemoryAnalysis(
                title="Stay hungry, stay foolish",
                content_type="quote",
                intent_mode="REMEMBER",
                intent_summary="User wants to remember this quote.",
                description="Inspirational quote captured from a screenshot.",
                searchable_text=(
                    "Stay hungry stay foolish quote. Inspiration. Category: quote. Intent: REMEMBER."
                ),
                tags=["quote", "inspiration"],
                actionable=False,
                urgency="none",
                needs_live_search=False,
                confidence=0.92,
                answer=None,
                short_message="Saved quote: Stay hungry, stay foolish.",
                agent_activity=AgentActivity(
                    steps=["Screenshot understood", "Quote identified"],
                    web_search_used=False,
                    x_search_used=False,
                ),
            )

        return MemoryAnalysis(
            title="Screenshot memory",
            content_type="other",
            intent_mode="EXPLORE" if mode == "ask" else "REMEMBER",
            intent_summary="User captured something noteworthy.",
            description="General screenshot memory.",
            searchable_text="Screenshot memory. Category: other.",
            tags=["screenshot"],
            actionable=False,
            urgency="none",
            needs_live_search=False,
            confidence=0.6,
            answer="I saved this screenshot and can help you explore it." if mode == "ask" else None,
            short_message="Saved your screenshot to SnapAct.",
            agent_activity=AgentActivity(steps=["Screenshot understood"]),
        )


_grok: GrokService | None = None


def get_grok_service() -> GrokService:
    global _grok
    if _grok is None:
        _grok = GrokService()
    return _grok
