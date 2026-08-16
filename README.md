# SnapAct

**Screenshots are unfinished intentions.** SnapAct reads a screenshot, works out
what it is and why you kept it, files it somewhere you can find again, and tells
you when something needs doing.

```text
iPhone Shortcut  /  Web upload
        │
        ▼
Next.js API  ──►  Supabase Storage        (the image, private bucket)
        │
        ├────►  Cursor SDK · gpt-5.6-luna (read the screenshot, extract structure)
        │
        └────►  Postgres `memories`       (typed columns + pgvector + tsvector)
                        │
                        ▼
            plan ─► hybrid search ─► relevance gate ─► answer
                   (composer-2.5)      (composer-2.5)
```

There is no auth yet — everything belongs to `DEMO_USER_ID`.

---

## How retrieval works, and why it works this way

Three stages, each doing a job the others cannot:

1. **Query planner** turns a question into a semantic query plus optional filters
   (category, date range). Filters are advisory — if they narrow the result set
   below three candidates, the search re-runs without them. A wrong filter must
   never be able to hide the answer.
2. **Hybrid search** fuses pgvector cosine neighbours with Postgres full-text
   matches using Reciprocal Rank Fusion, and returns real scores.
3. **Relevance gate** judges every candidate and is allowed to reject all of them.

The gate is not optional, and here is the measurement that says so. On this
corpus, `gte-small` scores an *unrelated* query/document pair as high as **0.80**,
while a *genuine* match can sit at **0.78**. The distributions overlap, so no
cosine threshold can separate relevant from irrelevant. `p_min_similarity`
in the search function is a cheap tail-trim, nothing more. If results go wrong,
fix the gate — do not tune the threshold.

The visible payoff: ask SnapAct something it has nothing about and it says so,
instead of assembling a confident answer out of whatever happened to rank first.

---

## Setup

### 1. Database

```bash
supabase link --project-ref <your-project-ref>
supabase db push                     # applies supabase/migrations/
supabase functions deploy embed      # gte-small, 384-dim, no third-party API
```

Then create a **private** storage bucket named `screenshots`.

### 2. App

```bash
cd frontend
cp .env.example .env.local           # fill in Cursor + Supabase values
npm install
npm run dev
```

### 3. Verify

```bash
npm run verify                       # end-to-end checks against localhost:3000
curl localhost:3000/api/health       # per-dependency status
```

`npm run verify` checks the properties that matter, including that a nonsense
question returns zero memories.

---

## Environment

| Variable | Purpose |
|---|---|
| `CURSOR_API_KEY` | Cursor SDK credentials |
| `CURSOR_MODEL` | Vision model for screenshots (`gpt-5.6-luna`) |
| `CURSOR_SEARCH_MODEL` | Fast model for planning, gating, synthesis (`composer-2.5`) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SECRET_KEY` | Service key — server only, bypasses RLS |
| `SUPABASE_BUCKET` | Screenshot bucket (`screenshots`) |
| `DEMO_USER_ID` | Owner id for every memory |
| `USE_MOCK_CURSOR` | Unused by the pipeline; kept for local experiments |

---

## API

### Capture

| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/shortcut/save` | `image` | Understand and file it |
| `POST /api/shortcut/describe` | `image`, `user_note` | Save with your own context |
| `POST /api/shortcut/ask` | `image` + `question`, or `question` alone | Ask about one screenshot, or all of them |
| `POST /api/capture` | `image`, `mode` | Generic form used by the web UI |

All accept `multipart/form-data` with optional `source`, `captured_at`, and
`client_request_id`. Analysis runs **synchronously**, so the response already
carries the title, type, dates and actions — roughly 8–11s for a screenshot.

`client_request_id` is enforced by a unique constraint, so a Shortcut that
retries gets the original memory back instead of a duplicate.

### Read

| Endpoint | Notes |
|---|---|
| `GET /api/memories` | Real listing: `content_type`, `limit`, `offset`, `status` |
| `GET /api/memories/:id` | Primary-key lookup |
| `PATCH /api/memories/:id` | Edit title, tags, note, due date |
| `DELETE /api/memories/:id` | Removes the row and the stored image |
| `POST /api/memories/:id/complete` | Mark an action done |
| `GET /api/digest` | Deadlines, upcoming events, needs-a-decision — computed from indexed columns, no model call |
| `GET /api/search` | Hybrid search, ungated (browse) |
| `POST /api/ask` | Gated retrieval + synthesis; supports SSE streaming |
| `GET/POST /api/memories/repair` | Inspect and retry failed analyses |
| `GET /api/health` | Live check of database, embeddings, storage, model |

---

## Data model

`public.memories` — one row per screenshot. The important choices:

- **Taxonomy and provenance are separate columns.** `content_type` says what the
  screenshot *is* (`event`, `place`, `product`, `quote`, `message`, …);
  `source` and `capture_mode` say where it came from. Collapsing these into one
  `category` field is what made the previous store unqueryable.
- **Dates are real `date` columns**, not strings in a JSON blob. `due_on` and
  `event_on` are indexed, so the digest is a query rather than a guess.
- **`status` is explicit** (`pending` → `ready`, or `failed` with a reason and an
  attempt counter). A half-written row is always visible and always retryable.
- **`search_text`** is the retrieval blob feeding both the embedding and the
  generated `fts` tsvector. It carries no boilerplate — a shared prefix on every
  row would make every embedding partly identical.

---

## iPhone Shortcut

1. **Receive** images from the Share Sheet; if there is no input, **Ask For Photos**.
2. **Choose from Menu**: Save · Ask · Describe & Save.
3. **Get Contents of URL** — `POST https://<your-app>/api/shortcut/<save|ask|describe>`,
   Request Body **Form**, with `image` set to the Shortcut Input.
   Add `question` for Ask, `user_note` for Describe.
4. **Show Result** → `short_message`, which is always plain text.
