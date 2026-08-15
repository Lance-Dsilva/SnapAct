"""Backend tests for SnapAct MVP."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

# Force mock Grok before app import side effects
import os

os.environ["USE_MOCK_GROK"] = "true"
os.environ["DEMO_USER_ID"] = "demo-user"
os.environ["XAI_API_KEY"] = ""
os.environ["XAI_MODEL"] = ""

from config import get_settings
from main import app
from services import idempotency
from services.grok import GrokError, GrokService, get_grok_service
from services.memory_store import reset_memory_store_for_tests

get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _reset_state():
    get_settings.cache_clear()
    reset_memory_store_for_tests()
    idempotency.clear_all()
    yield
    idempotency.clear_all()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _png_bytes(color=(20, 120, 140)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color).save(buf, format="PNG")
    return buf.getvalue()


def test_health(client: TestClient):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "snapact"
    assert data["grok_configured"] is True
    assert data["memory_store_configured"] is True
    assert "XAI_API_KEY" not in resp.text


def test_capture_quote_remember_no_live_search(client: TestClient):
    files = {"image": ("quote.png", _png_bytes(), "image/png")}
    data = {"mode": "save", "source": "web"}
    resp = client.post("/api/v1/capture", data=data, files=files)
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysis"]["intent_mode"] == "REMEMBER"
    assert body["analysis"]["content_type"] == "quote"
    assert body["analysis"]["needs_live_search"] is False
    assert body["analysis"]["agent_activity"]["web_search_used"] is False
    assert body["memory_id"]
    assert body["short_message"]


def test_capture_event_act_structured(client: TestClient):
    files = {"image": ("event.png", _png_bytes((200, 80, 40)), "image/png")}
    data = {
        "mode": "ask",
        "question": "Are there similar events in Austin?",
        "source": "iphone",
    }
    resp = client.post("/api/v1/capture", data=data, files=files)
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysis"]["intent_mode"] == "ACT"
    assert body["analysis"]["content_type"] == "event"
    assert body["analysis"]["needs_live_search"] is True
    assert body["short_message"]
    assert body["answer"]


def test_ask_about_event(client: TestClient):
    # Seed via capture first
    files = {"image": ("event.png", _png_bytes(), "image/png")}
    client.post(
        "/api/v1/capture",
        data={"mode": "ask", "question": "similar events in Austin", "source": "web"},
        files=files,
    )
    resp = client.post("/api/v1/ask", json={"question": "What AI events did I save?"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["answer"]
    assert isinstance(body["memories"], list)


def test_search(client: TestClient):
    files = {"image": ("q.png", _png_bytes(), "image/png")}
    client.post("/api/v1/capture", data={"mode": "save", "source": "web"}, files=files)
    resp = client.post(
        "/api/v1/search",
        json={"query": "quote inspiration", "top_k": 5},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["query"] == "quote inspiration"
    assert isinstance(body["results"], list)
    assert len(body["results"]) >= 1


def test_grok_failure_graceful(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    async def boom(*_args, **_kwargs):
        raise GrokError("forced failure")

    monkeypatch.setattr(GrokService, "analyze_screenshot", boom)
    # Also patch singleton
    monkeypatch.setattr(get_grok_service(), "analyze_screenshot", boom)

    files = {"image": ("x.png", _png_bytes(), "image/png")}
    resp = client.post("/api/v1/capture", data={"mode": "save", "source": "web"}, files=files)
    assert resp.status_code == 200
    body = resp.json()
    assert body["degraded"] is True
    assert body["memory_id"]
    assert body["warning"]


def test_invalid_image(client: TestClient):
    files = {"image": ("bad.txt", b"not-an-image", "text/plain")}
    resp = client.post("/api/v1/capture", data={"mode": "save", "source": "web"}, files=files)
    assert resp.status_code == 400
    assert "detail" in resp.json()


def test_ask_requires_question(client: TestClient):
    files = {"image": ("x.png", _png_bytes(), "image/png")}
    resp = client.post("/api/v1/capture", data={"mode": "ask", "source": "web"}, files=files)
    assert resp.status_code == 400


def test_idempotency(client: TestClient):
    files = {"image": ("q.png", _png_bytes(), "image/png")}
    data = {"mode": "save", "source": "shortcut", "client_request_id": "req-abc-1"}
    r1 = client.post("/api/v1/capture", data=data, files=files)
    files2 = {"image": ("q.png", _png_bytes(), "image/png")}
    r2 = client.post("/api/v1/capture", data=data, files=files2)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["memory_id"] == r2.json()["memory_id"]
    assert r2.json()["duplicate"] is True


def test_memories_and_intelligence(client: TestClient):
    listed = client.get("/api/v1/memories")
    assert listed.status_code == 200
    assert len(listed.json()["memories"]) >= 1

    refresh = client.post("/api/v1/intelligence/refresh")
    assert refresh.status_code == 200
    feed = refresh.json()
    assert "needs_attention" in feed
    assert "generated_at" in feed
