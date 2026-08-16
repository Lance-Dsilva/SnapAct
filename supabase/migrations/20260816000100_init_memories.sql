-- SnapAct memory schema.
--
-- Design notes:
--  * Taxonomy (`content_type`) and provenance (`source`, `capture_mode`) are separate
--    columns. Collapsing them into one `category` field is what made the previous
--    store unqueryable ("manual-upload" is not a kind of thing).
--  * Every screenshot gets a row immediately with status='pending'. Analysis fills it
--    in later and flips status to 'ready'. A row is never silently half-written.
--  * Retrieval is hybrid: pgvector for semantics, tsvector for exact terms. Both
--    return real scores so callers can enforce a relevance floor.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- enums

do $$ begin
  create type memory_status as enum ('pending', 'ready', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_type as enum (
    'event',      -- something happening at a time/place
    'place',      -- a venue, restaurant, location
    'product',    -- an item for sale
    'person',     -- someone to follow up with
    'job',        -- a role or opportunity
    'quote',      -- a quotation, standalone text worth keeping
    'knowledge',  -- a fact, doc, tutorial, reference
    'idea',       -- the user's own thought or inspiration
    'task',       -- something to do
    'message',    -- a conversation, DM, tweet, comment thread
    'media',      -- a movie, show, song, video, book
    'document',   -- a form, ticket, confirmation, statement
    'receipt',    -- proof of purchase
    'app_ui',     -- a settings screen, home screen, app config
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type intent_mode as enum ('REMEMBER', 'EXPLORE', 'ACT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type urgency_level as enum ('none', 'low', 'medium', 'high');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- table

create table if not exists public.memories (
  id                 uuid primary key default gen_random_uuid(),
  user_id            text        not null,
  client_request_id  text        not null,
  status             memory_status not null default 'pending',

  -- provenance
  source             text,                -- iphone | web | api
  capture_mode       text,                -- save | ask | describe
  captured_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- image
  image_path         text,
  image_bytes        integer,
  image_mime         text,

  -- taxonomy
  title              text,
  content_type       content_type not null default 'other',
  intent_mode        intent_mode  not null default 'REMEMBER',
  intent_summary     text,
  description        text,
  ocr_text           text,
  tags               text[]  not null default '{}',
  entities           jsonb   not null default '[]'::jsonb,

  -- action layer
  actionable         boolean not null default false,
  urgency            urgency_level not null default 'none',
  due_on             date,
  event_on           date,
  completed_at       timestamptz,
  suggested_actions  jsonb not null default '[]'::jsonb,

  -- typed facets, only populated for the matching content_type
  event              jsonb,
  place              jsonb,
  person             jsonb,
  product            jsonb,

  -- user-supplied context
  user_note          text,
  user_question      text,
  answer             text,
  citations          jsonb not null default '[]'::jsonb,

  -- model bookkeeping
  confidence         real,
  model              text,
  analysis           jsonb,
  analysis_error     text,
  analysis_attempts  integer not null default 0,

  -- retrieval
  search_text        text,
  embedding          extensions.vector(384),
  fts                tsvector generated always as (
                       to_tsvector('english', coalesce(search_text, ''))
                     ) stored,

  constraint memories_client_request_unique unique (user_id, client_request_id)
);

comment on column public.memories.search_text is
  'Denormalized retrieval blob: title + description + ocr + tags + user note. Source for both fts and embedding.';
comment on column public.memories.content_type is
  'What the screenshot IS. Never a provenance value -- use source for that.';

-- ---------------------------------------------------------------- indexes

create index if not exists memories_user_created_idx
  on public.memories (user_id, created_at desc);

create index if not exists memories_user_type_created_idx
  on public.memories (user_id, content_type, created_at desc);

create index if not exists memories_user_status_idx
  on public.memories (user_id, status)
  where status <> 'ready';

create index if not exists memories_due_idx
  on public.memories (user_id, due_on)
  where due_on is not null and completed_at is null;

create index if not exists memories_event_idx
  on public.memories (user_id, event_on)
  where event_on is not null;

create index if not exists memories_tags_idx
  on public.memories using gin (tags);

create index if not exists memories_fts_idx
  on public.memories using gin (fts);

create index if not exists memories_title_trgm_idx
  on public.memories using gin (title extensions.gin_trgm_ops);

-- HNSW for cosine distance. Small corpus, but correct from day one.
create index if not exists memories_embedding_idx
  on public.memories using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------- updated_at

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists memories_touch_updated_at on public.memories;
create trigger memories_touch_updated_at
  before update on public.memories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
-- No end-user auth yet; the app is the only client and holds the secret key.
-- RLS is on with no permissive policy, so anon/publishable keys can read nothing.

alter table public.memories enable row level security;

-- ---------------------------------------------------------------- search

-- Hybrid retrieval with Reciprocal Rank Fusion.
--
-- Returns real scores (similarity, lexical_rank, matched_by) so callers can make
-- an informed relevance decision -- which the previous gateway made impossible by
-- returning no scores at all.
--
-- IMPORTANT: p_min_similarity is a cheap tail-trim, NOT a relevance filter.
-- Measured on this corpus, gte-small scores unrelated pairs up to 0.80 and genuine
-- matches as low as 0.78 -- the ranges overlap, so no cosine threshold can separate
-- them. Authoritative relevance filtering happens in the LLM gate in
-- src/lib/retrieval/retrieve.ts. Do not "tune" this number to fix bad results.
create or replace function public.search_memories(
  p_user_id        text,
  p_query          text                  default null,
  p_embedding      extensions.vector(384) default null,
  p_limit          integer               default 20,
  p_min_similarity real                  default 0.70,
  p_content_types  content_type[]        default null,
  p_intent_modes   intent_mode[]         default null,
  p_tags           text[]                default null,
  p_created_after  timestamptz           default null,
  p_created_before timestamptz           default null,
  p_actionable     boolean               default null,
  p_include_done   boolean               default true,
  p_require_image  boolean               default false,
  p_pool           integer               default 60
)
returns table (
  id            uuid,
  similarity    real,
  lexical_rank  real,
  score         real,
  matched_by    text
)
language sql
stable
as $$
  with base as (
    select m.id, m.embedding, m.fts
    from public.memories m
    where m.user_id = p_user_id
      and m.status = 'ready'
      and (p_content_types  is null or m.content_type = any(p_content_types))
      and (p_intent_modes   is null or m.intent_mode  = any(p_intent_modes))
      and (p_tags           is null or m.tags && p_tags)
      and (p_created_after  is null or m.created_at >= p_created_after)
      and (p_created_before is null or m.created_at <= p_created_before)
      and (p_actionable     is null or m.actionable  = p_actionable)
      and (p_include_done   or m.completed_at is null)
      and (not p_require_image or m.image_path is not null)
  ),
  vec as (
    select
      b.id,
      (1 - (b.embedding operator(extensions.<=>) p_embedding))::real as similarity,
      row_number() over (order by b.embedding operator(extensions.<=>) p_embedding) as rnk
    from base b
    where p_embedding is not null
      and b.embedding is not null
    order by b.embedding operator(extensions.<=>) p_embedding
    limit p_pool
  ),
  kw as (
    select
      b.id,
      ts_rank_cd(b.fts, q.tsq)::real as lexical_rank,
      row_number() over (order by ts_rank_cd(b.fts, q.tsq) desc) as rnk
    from base b
    cross join lateral (select websearch_to_tsquery('english', coalesce(p_query, '')) as tsq) q
    where coalesce(p_query, '') <> ''
      and b.fts @@ q.tsq
    order by ts_rank_cd(b.fts, q.tsq) desc
    limit p_pool
  ),
  fused as (
    select
      coalesce(v.id, k.id)                       as id,
      coalesce(v.similarity, 0)::real            as similarity,
      coalesce(k.lexical_rank, 0)::real          as lexical_rank,
      (coalesce(1.0 / (50 + v.rnk), 0)
       + coalesce(1.0 / (50 + k.rnk), 0))::real  as score,
      case
        when v.id is not null and k.id is not null then 'hybrid'
        when k.id is not null then 'lexical'
        else 'semantic'
      end                                        as matched_by
    from vec v
    full outer join kw k on k.id = v.id
  )
  -- A lexical hit is self-evident evidence; a purely semantic neighbour must at
  -- least clear the tail-trim. Final relevance is decided by the caller's gate.
  select f.id, f.similarity, f.lexical_rank, f.score, f.matched_by
  from fused f
  where f.matched_by <> 'semantic' or f.similarity >= p_min_similarity
  order by f.score desc, f.similarity desc
  limit p_limit;
$$;

-- Counts by content_type, for the Home filter chips. One round trip, not N.
create or replace function public.memory_type_counts(p_user_id text)
returns table (content_type content_type, total bigint)
language sql
stable
as $$
  select m.content_type, count(*)::bigint
  from public.memories m
  where m.user_id = p_user_id and m.status = 'ready'
  group by m.content_type
  order by count(*) desc;
$$;
