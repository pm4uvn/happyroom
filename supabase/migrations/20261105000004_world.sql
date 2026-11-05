-- HAPPYROOM World: persistent zones, player profiles, progress and safety.
-- High-frequency transforms stay in game-server memory; only last location is persisted.

create type public.zone_status as enum ('draft', 'published', 'archived');
create type public.age_band as enum ('under13', 'teen', 'adult');
create type public.player_auth_kind as enum ('guest', 'password', 'google');

create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  world_key text not null unique check (world_key ~ '^[a-z0-9_]{2,48}$'),
  display_name text not null,
  default_zone_key text not null,
  created_at timestamptz not null default now()
);

create table public.world_versions (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  version text not null check (version ~ '^\d+\.\d+\.\d+$'),
  content_hash text not null,
  notes text,
  published_at timestamptz not null default now(),
  constraint world_versions_unique unique (world_id, content_hash)
);

create table public.world_zones (
  id uuid primary key default gen_random_uuid(),
  world_id uuid not null references public.worlds (id) on delete cascade,
  zone_key text not null check (zone_key ~ '^[a-z0-9_]{2,48}$'),
  display_name jsonb not null check (jsonb_typeof(display_name) = 'object'),
  version text not null check (version ~ '^\d+\.\d+\.\d+$'),
  bounds jsonb not null check (jsonb_typeof(bounds) = 'object'),
  environment_preset text not null,
  max_players smallint not null check (max_players between 2 and 100),
  published_status public.zone_status not null default 'draft',
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  collision_asset_url text,
  navmesh_asset_url text,
  -- Full validated zone definition (packages/world zone schema). Source of truth at runtime.
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  content_hash text not null,
  updated_at timestamptz not null default now(),
  constraint world_zones_unique unique (world_id, zone_key)
);
create index world_zones_status_idx on public.world_zones (world_id, published_status);

create table public.zone_assets (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.world_zones (id) on delete cascade,
  asset_key text not null check (char_length(asset_key) between 1 and 64),
  kind text not null check (kind in ('environment', 'collision', 'navmesh', 'object')),
  url text not null check (char_length(url) between 1 and 512),
  version text not null,
  constraint zone_assets_unique unique (zone_id, asset_key)
);

create table public.zone_spawn_points (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.world_zones (id) on delete cascade,
  spawn_key text not null check (spawn_key ~ '^[a-z0-9_]{2,48}$'),
  x real not null,
  z real not null,
  rot_y real not null default 0,
  is_default boolean not null default false,
  constraint zone_spawn_points_unique unique (zone_id, spawn_key)
);
create unique index zone_spawn_points_one_default on public.zone_spawn_points (zone_id) where is_default;

create table public.zone_portals (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.world_zones (id) on delete cascade,
  portal_key text not null check (portal_key ~ '^[a-z0-9_]{2,48}$'),
  x real not null,
  z real not null,
  radius real not null check (radius > 0 and radius <= 6),
  target_kind text not null check (target_kind in ('zone', 'birthday_house')),
  target_zone_key text,
  target_spawn_key text,
  return_spawn_key text not null,
  constraint zone_portals_unique unique (zone_id, portal_key),
  constraint zone_portals_target check ((target_kind = 'zone') = (target_zone_key is not null and target_spawn_key is not null))
);

-- Players --------------------------------------------------------------------

create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_kind public.player_auth_kind not null,
  -- Unique, case-insensitive public name.
  display_name text not null check (char_length(display_name) between 2 and 24),
  avatar_preset text not null check (avatar_preset in ('sunny', 'berry', 'mint', 'cocoa', 'sky', 'plum')),
  age_band public.age_band not null default 'teen',
  -- Password accounts: lowercase login name + scrypt hash. Never returned to clients.
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  password_hash text check (char_length(password_hash) <= 255),
  -- OAuth (Google via Supabase Auth): provider subject (auth.users.id), never the token.
  provider_subject text unique check (char_length(provider_subject) <= 128),
  -- Privacy & safety settings.
  chat_enabled boolean not null default true,
  show_in_player_list boolean not null default true,
  profile_complete boolean not null default false,
  banned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint player_profiles_password check ((auth_kind = 'password') = (username is not null and password_hash is not null)),
  constraint player_profiles_google check ((auth_kind = 'google') = (provider_subject is not null))
);
create unique index player_profiles_display_name_ci on public.player_profiles (lower(display_name));
create trigger player_profiles_updated_at before update on public.player_profiles
  for each row execute function public.set_updated_at();

-- Browser sessions for world players (opaque secret in an httpOnly cookie, SHA-256 stored).
create table public.player_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.player_profiles (id) on delete cascade,
  secret_hash bytea not null unique check (octet_length(secret_hash) = 32),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index player_sessions_profile_idx on public.player_sessions (profile_id);
create index player_sessions_expires_idx on public.player_sessions (expires_at);

create table public.player_locations (
  profile_id uuid primary key references public.player_profiles (id) on delete cascade,
  zone_id uuid not null references public.world_zones (id) on delete cascade,
  x real not null,
  z real not null,
  rot_y real not null default 0,
  -- Portal the player last left through (to return at the right door).
  last_portal_key text,
  updated_at timestamptz not null default now()
);

create table public.player_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.player_profiles (id) on delete cascade,
  progress_key text not null check (progress_key ~ '^[a-z0-9_.]{2,64}$'),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint player_progress_unique unique (profile_id, progress_key)
);

create table public.world_events (
  id bigint generated always as identity primary key,
  world_id uuid references public.worlds (id) on delete set null,
  zone_id uuid references public.world_zones (id) on delete set null,
  profile_id uuid references public.player_profiles (id) on delete set null,
  event_type text not null check (event_type in ('zone_enter', 'zone_leave', 'portal_use', 'chat_blocked', 'report', 'block', 'moderation')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index world_events_type_time_idx on public.world_events (event_type, created_at);

-- Safety -----------------------------------------------------------------------

create table public.player_blocks (
  blocker_id uuid not null references public.player_profiles (id) on delete cascade,
  blocked_id uuid not null references public.player_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint player_blocks_not_self check (blocker_id <> blocked_id)
);

create table public.player_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.player_profiles (id) on delete set null,
  target_id uuid references public.player_profiles (id) on delete set null,
  zone_id uuid references public.world_zones (id) on delete set null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  -- Evidence (e.g. the reported chat line, which is not otherwise stored).
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  constraint player_reports_not_self check (reporter_id is null or reporter_id <> target_id)
);
create index player_reports_status_idx on public.player_reports (status, created_at);

-- Access: server-only. Browser roles get nothing (RLS on, privileges revoked) — all reads/writes
-- go through validated Next.js routes or the game server.
do $$
declare t text;
begin
  foreach t in array array['worlds','world_versions','world_zones','zone_assets','zone_spawn_points','zone_portals',
                           'player_profiles','player_sessions','player_locations','player_progress','world_events',
                           'player_blocks','player_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;
grant usage, select on all sequences in schema public to service_role;
