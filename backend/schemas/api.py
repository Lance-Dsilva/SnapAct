"""HTTP request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from schemas.memory import (
    AttentionItem,
    Citation,
    HomeFeedPlan,
    MemoryAnalysis,
    SuggestedAction,
)


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "snapact"
    grok_configured: bool
    memory_store_configured: bool
    using_remote_memory: bool = False
    demo_user_id: str = "demo-user"


class CaptureResponse(BaseModel):
    memory_id: str
    short_message: str
    answer: str | None = None
    analysis: MemoryAnalysis
    suggested_actions: list[SuggestedAction] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    image_url: str | None = None
    agent_activity: dict[str, Any] = Field(default_factory=dict)
    duplicate: bool = False
    degraded: bool = False
    warning: str | None = None


class SearchRequest(BaseModel):
    query: str
    top_k: int = Field(default=8, ge=1, le=50)
    filters: dict[str, Any] = Field(default_factory=dict)


class SearchResultItem(BaseModel):
    memory_id: str
    title: str
    description: str
    image_url: str | None = None
    content_type: str
    intent_mode: str
    score: float
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]


class AskRequest(BaseModel):
    question: str
    top_k: int = Field(default=8, ge=1, le=20)


class AskResponse(BaseModel):
    answer: str
    memories: list[SearchResultItem] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    short_message: str | None = None


class MemoriesListResponse(BaseModel):
    memories: list[dict[str, Any]]
    source: Literal["api", "mock"] = "api"


class IntelligenceRefreshResponse(HomeFeedPlan):
    pass


class CompleteMemoryRequest(BaseModel):
    completed: bool = True


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
