"""Simple in-process idempotency for capture retries."""

from __future__ import annotations

import threading
import time
from typing import Any

_lock = threading.Lock()
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_TTL_SECONDS = 60 * 60 * 6  # 6 hours


def get_cached_response(client_request_id: str | None) -> dict[str, Any] | None:
    if not client_request_id:
        return None
    now = time.time()
    with _lock:
        _purge_expired(now)
        item = _cache.get(client_request_id)
        if not item:
            return None
        return item[1]


def store_response(client_request_id: str | None, response: dict[str, Any]) -> None:
    if not client_request_id:
        return
    with _lock:
        _cache[client_request_id] = (time.time(), response)


def _purge_expired(now: float) -> None:
    expired = [k for k, (ts, _) in _cache.items() if now - ts > _TTL_SECONDS]
    for key in expired:
        del _cache[key]


def clear_all() -> None:
    with _lock:
        _cache.clear()
