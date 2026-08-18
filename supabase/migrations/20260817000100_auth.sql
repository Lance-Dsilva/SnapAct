-- Authentication state for SnapAct.
--
-- One row. The passcode is stored as a PBKDF2-SHA256 hash with a per-install
-- salt, never in plaintext, so reading the table does not reveal it.
--
-- A 4-digit passcode is only 10,000 combinations, which is why `failed_attempts`
-- and `locked_until` exist: without throttling, a short numeric code is trivially
-- enumerable. Lockout is enforced server-side.

create table if not exists public.app_settings (
  id                smallint primary key default 1,
  passcode_hash     text        not null,
  passcode_salt     text        not null,
  passcode_updated  timestamptz not null default now(),

  -- Bearer token for the iPhone Shortcut endpoints. Kept readable so it can be
  -- displayed to an authenticated owner for copying into Shortcuts; rotating it
  -- immediately invalidates the old one.
  shortcut_key      text        not null,
  shortcut_rotated  timestamptz not null default now(),

  failed_attempts   integer     not null default 0,
  locked_until      timestamptz,
  last_unlocked_at  timestamptz,

  constraint app_settings_singleton check (id = 1)
);

alter table public.app_settings enable row level security;

comment on table public.app_settings is
  'Singleton auth state. Service-role only; RLS is on with no policy so anon and publishable keys can read nothing.';
