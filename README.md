# SnapAct — Cursor SDK architecture (hackathon)

**Screenshots are unfinished intentions.**

SnapAct turns screenshots into memory, answers, and actions using **GPT-5.6 Luna via the Cursor SDK**.

```text
Apple Shortcut / Web App
        ↓
Next.js API Routes (/api/*)
        ↓
Cursor SDK → GPT-5.6 Luna (screenshots) / Composer 2.5 (Ask)
        ↓
Tools (webSearch, webFetch, custom memory tools)
        ↓
MemoryStore adapter → Supabase HTTP gateway (or mock)
```

No authentication — all data belongs to `demo-user`.

> The legacy FastAPI + direct xAI client under `backend/` is **deprecated** and not required for the demo.

---

## Local setup

```bash
cd frontend
cp .env.example .env.local
# Set CURSOR_API_KEY + CURSOR_MODEL (or USE_MOCK_CURSOR=true)
npm install
npm run dev
```

App: http://localhost:3000

### Cursor SDK smoke tests

```bash
cd frontend
npm run list-models          # requires CURSOR_API_KEY
# copy the vision model id into CURSOR_MODEL (default gpt-5.6-luna)
npm run test-cursor          # expects: SNAPACT GROK WORKING
npm run test-api-mock        # offline flow tests (mock agent)
```

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `CURSOR_API_KEY` | server | Cursor API key (credits) |
| `CURSOR_MODEL` | server | Screenshot analysis model (default `gpt-5.6-luna`) |
| `CURSOR_SEARCH_MODEL` | server | Fast/cheap model for Ask synthesis (default `composer-2.5`) |
| `USE_MOCK_CURSOR` | server | Offline mock without Cursor calls |
| `DEMO_USER_ID` | server | default `demo-user` |
| `MEMORY_*_ENDPOINT` | server | Teammate Supabase HTTP gateway |
| `NEXT_PUBLIC_API_BASE_URL` | client | Optional; leave empty for same-origin `/api` |

**Never** put `CURSOR_API_KEY` in a `NEXT_PUBLIC_` variable.

---

## API routes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Status (no secrets) |
| POST | `/api/capture` | Multipart save / ask / describe |
| POST | `/api/search` | Memory search |
| POST | `/api/ask` | Ask across memories |
| GET | `/api/memories` | List |
| GET | `/api/memories/[id]` | Detail |
| POST | `/api/memories/[id]/complete` | Mark done |
| POST | `/api/intelligence/refresh` | Home feed plan |

### Capture fields (`multipart/form-data`)

| Field | Required | Notes |
|---|---|---|
| `image` | yes | PNG/JPEG |
| `mode` | yes | `save` \| `ask` \| `describe` |
| `question` | if ask | User question |
| `user_description` | if describe | User context |
| `source` | no | `iphone` \| `mac` \| `web` |
| `client_request_id` | no | Idempotency |

All modes **save** a memory. Responses include `short_message` for Apple Shortcut **Show Result**.

---

## Apple Shortcut

1. Share Sheet image → Choose Save / Ask / Describe  
2. `Get Contents of URL` → `POST {origin}/api/capture` (Form)  
3. Read `short_message` → Show Result  

---

## Cursor tools available to the agent

Built-in (Cursor SDK `ToolName`):

- `webSearch`
- `webFetch`

Custom tools (local agent):

- `search_memories`
- `list_recent_memories`
- `get_memory`

Filesystem mutation tools (`shell`, `edit`, `delete`) are disallowed in API runs.

There is **no** dedicated `x_search` tool in the Cursor SDK tool list. Live research uses `webSearch` / `webFetch`.

Screenshot/image input: supported via `agent.send({ text, images: [{ data, mimeType }] })`.

---

## Supabase contract (teammate)

All storage goes through `src/lib/memory/memory-store.ts`.

Provide:

- `MEMORY_SAVE_ENDPOINT`
- `MEMORY_SEARCH_ENDPOINT`
- `MEMORY_LIST_ENDPOINT` (homepage)
- `MEMORY_GET_ENDPOINT`
- `MEMORY_UPDATE_ENDPOINT`

Until then, SnapAct uses an in-memory mock with demo seeds.

---

## Deploy (Vercel)

One project: **snapact** → https://snapact-beta.vercel.app

The Next.js app in `frontend/` is the UI and the API (`/api/*`, including Apple Shortcut routes). There is no second Vercel project and no FastAPI service.

1. GitHub `main` deploys this project (root directory `frontend`).
2. Set server env: `CURSOR_API_KEY`, `CURSOR_MODEL=gpt-5.6-luna`, `CURSOR_SEARCH_MODEL=composer-2.5`, `DEMO_USER_ID`, Supabase, memory endpoints.
3. Increase function duration if needed (`maxDuration` is set on capture/ask routes).

Shortcut URLs:

- `POST https://snapact-beta.vercel.app/api/shortcut/save` — multipart image
- `POST https://snapact-beta.vercel.app/api/shortcut/ask` — image+question **or** JSON `{ "question": "..." }` across memories
- `POST https://snapact-beta.vercel.app/api/shortcut/describe` — multipart image
- Stream Ask: same Ask URLs with `"stream": true` or `Accept: text/event-stream` (SSE). Apple Shortcuts **Get Contents of URL** waits for the full JSON; use `short_message` / `answer` (real line breaks) for Show Result.

Note: Cursor SDK local agents run in the Node process. Prefer local `npm run dev` for the most reliable agent tooling demo; validate Vercel cold-starts separately.

---

## Demo script

1. Upload event → Save → ACT → appears on home  
2. Upload event → Ask “similar events in Austin?” → `short_message` answer + saved  
3. Upload restaurant → Describe “Potential birthday dinner” → Ask “restaurants for my birthday?”
