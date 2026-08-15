"""SnapAct FastAPI application."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import ask, capture, health, intelligence, memories, search
from config import get_settings

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("snapact")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    logger.info(
        "SnapAct starting demo_user=%s grok_configured=%s remote_memory=%s",
        settings.demo_user_id,
        settings.grok_configured,
        settings.using_remote_memory,
    )
    if not settings.xai_api_key or not settings.xai_model:
        if not settings.use_mock_grok:
            logger.warning(
                "XAI_API_KEY / XAI_MODEL not set — set USE_MOCK_GROK=true for offline demo, "
                "or configure xAI credentials."
            )
    yield


app = FastAPI(
    title="SnapAct API",
    version="1.0.0",
    description="Screenshots → memory, answers, and actions powered by Grok 4.6",
    lifespan=lifespan,
)

settings = get_settings()
origins = [
    o.strip()
    for o in os.getenv("FRONTEND_ORIGIN", settings.frontend_origin).split(",")
    if o.strip()
]
# Always allow local Next.js during hackathon development.
for local in ("http://localhost:3000", "http://127.0.0.1:3000"):
    if local not in origins:
        origins.append(local)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

prefix = "/api/v1"
app.include_router(health.router, prefix=prefix)
app.include_router(capture.router, prefix=prefix)
app.include_router(search.router, prefix=prefix)
app.include_router(ask.router, prefix=prefix)
app.include_router(memories.router, prefix=prefix)
app.include_router(intelligence.router, prefix=prefix)


@app.get("/")
async def root():
    return {
        "service": "snapact",
        "docs": "/docs",
        "health": "/api/v1/health",
    }
