"""Core memory / analysis schemas for SnapAct."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ContentType = Literal[
    "event",
    "quote",
    "knowledge",
    "idea",
    "place",
    "product",
    "job",
    "person_followup",
    "conversation",
    "document",
    "other",
]

IntentMode = Literal["REMEMBER", "EXPLORE", "ACT"]

Urgency = Literal["none", "low", "medium", "high"]

ActionType = Literal[
    "open_url",
    "register",
    "add_calendar",
    "remind",
    "follow_up",
    "view",
    "research",
    "save",
    "none",
]


class Entity(BaseModel):
    name: str
    type: str = "other"


class SuggestedAction(BaseModel):
    type: ActionType
    label: str
    url: str | None = None
    due_at: datetime | None = None
    reason: str | None = None


class TemporalMetadata(BaseModel):
    event_date: str | None = None
    event_end_date: str | None = None
    timezone: str | None = None
    is_upcoming: bool | None = None
    relative_summary: str | None = None


class EventMetadata(BaseModel):
    name: str | None = None
    date: str | None = None
    location: str | None = None
    organizer: str | None = None
    registration_url: str | None = None
    status: str | None = None


class FollowUpMetadata(BaseModel):
    person_name: str | None = None
    topic: str | None = None
    due_hint: str | None = None
    completed: bool = False


class PlaceMetadata(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    category: str | None = None


class ProductMetadata(BaseModel):
    name: str | None = None
    brand: str | None = None
    price_hint: str | None = None
    category: str | None = None


class Citation(BaseModel):
    title: str | None = None
    url: str
    source: Literal["web", "x", "screenshot", "other"] = "web"
    snippet: str | None = None


class AgentActivity(BaseModel):
    """High-level agent activity for UI — never private chain-of-thought."""

    steps: list[str] = Field(default_factory=list)
    web_search_used: bool = False
    x_search_used: bool = False
    live_verification: bool = False
    live_verification_failed: bool = False
    notes: str | None = None


class MemoryAnalysis(BaseModel):
    title: str
    content_type: ContentType
    intent_mode: IntentMode
    intent_summary: str
    description: str
    searchable_text: str
    tags: list[str] = Field(default_factory=list)
    entities: list[Entity] = Field(default_factory=list)
    extracted_text_summary: str | None = None
    actionable: bool = False
    urgency: Urgency = "none"
    needs_live_search: bool = False
    suggested_actions: list[SuggestedAction] = Field(default_factory=list)
    temporal: TemporalMetadata | None = None
    event: EventMetadata | None = None
    person_followup: FollowUpMetadata | None = None
    place: PlaceMetadata | None = None
    product: ProductMetadata | None = None
    confidence: float = 0.5
    answer: str | None = None
    citations: list[Citation] = Field(default_factory=list)
    agent_activity: AgentActivity = Field(default_factory=AgentActivity)
    short_message: str | None = None


class MemoryRecord(BaseModel):
    memory_id: str
    user_id: str
    image_url: str | None = None
    created_at: str
    updated_at: str | None = None
    searchable_text: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    analysis: MemoryAnalysis | None = None
    source: str | None = None
    captured_at: str | None = None
    question: str | None = None
    completed: bool = False
    client_request_id: str | None = None


class MemorySearchHit(BaseModel):
    memory_id: str
    score: float
    image_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    analysis: MemoryAnalysis | None = None


class AttentionItem(BaseModel):
    memory_id: str
    title: str
    reason: str
    priority: float
    content_type: ContentType | None = None
    intent_mode: IntentMode | None = None
    image_url: str | None = None
    suggested_action: SuggestedAction | None = None


class HomeFeedPlan(BaseModel):
    generated_at: str
    needs_attention: list[AttentionItem] = Field(default_factory=list)
    upcoming_events: list[AttentionItem] = Field(default_factory=list)
    follow_ups: list[AttentionItem] = Field(default_factory=list)
    suggested_explorations: list[AttentionItem] = Field(default_factory=list)
    quotes: list[AttentionItem] = Field(default_factory=list)
    recent: list[AttentionItem] = Field(default_factory=list)
