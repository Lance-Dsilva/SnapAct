# Deprecated FastAPI + direct xAI backend

SnapAct now runs as a **single Next.js app** with Cursor SDK API routes:

```text
frontend/src/app/api/*
frontend/src/lib/agents/snapact-agent.ts
```

This `backend/` folder is kept only as reference from the earlier architecture.
Do not deploy it for the hackathon unless you have a special need.

Use:

```bash
cd frontend && npm run dev
```
