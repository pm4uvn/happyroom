-- HAPPYROOM core schema
-- Conventions:
--   * UUID primary keys (gen_random_uuid, built into PostgreSQL 13+), timestamptz in UTC.
--   * Secrets (session secrets, invitation tokens, recovery codes, access codes) are stored ONLY as hashes.
--   * Money is integer minor units + ISO-4217 currency.
--   * High-frequency realtime data (positions, emotes) is never persisted here.
--   * Enum values must match packages/shared/src/enums.ts (asserted by enums.test.ts).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.event_type as enum ('birthday', 'wedding', 'graduation', 'anniversary', 'corporate');
create type public.room_status as enum ('scheduled', 'open', 'live', 'ended', 'archived', 'deleted');
create type public.room_privacy as enum ('invite_link', 'access_code');
create type public.participant_role as enum ('host', 'cohost', 'guest');
create type public.ceremony_phase as enum ('IDLE', 'PREPARING', 'COUNTDOWN', 'CANDLES_OUT', 'CELEBRATION', 'COMPLETE');
create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'removed');
create type public.room_gift_status as enum ('sent', 'opened', 'removed');
create type public.media_kind as enum ('memory_photo', 'snapshot', 'share_card');
create type public.media_status as enum ('pending_upload', 'uploaded', 'approved', 'rejected', 'deleted');
create type public.report_target_type as enum ('participant', 'chat_message', 'wish', 'gift', 'media');
create type public.report_reason as enum ('harassment', 'hate', 'sexual', 'spam', 'self_harm', 'violence', 'other');
create type public.report_status as enum ('open', 'actioned', 'dismissed');
create type public.order_status as enum ('pending', 'paid', 'failed', 'refunded', 'cancelled');
create type public.product_kind as enum ('virtual_gift', 'room_theme', 'room_upgrade');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- Registered (optional) accounts. 1:1 with Supabase auth.users.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 64),
  preferred_locale text not null default 'en' check (preferred_locale in ('en', 'vi', 'ja')),
  -- Optional birthday for reminders: month/day only, never the year (age is not collected).
  birthday_month smallint check (birthday_month between 1 and 12),
  birthday_day smallint check (birthday_day between 1 and 31),
  birthday_reminders_opt_in boolean not null default false,
  reminders_consented_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_birthday_pair check ((birthday_month is null) = (birthday_day is null)),
  constraint users_reminder_consent check (not birthday_reminders_opt_in or reminders_consented_at is not null)
);
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- Guest identities: no account required. The browser holds an opaque secret (httpOnly cookie);
-- only its SHA-256 is stored. A host additionally receives a one-time recovery code.
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  secret_hash bytea not null unique check (octet_length(secret_hash) = 32),
  recovery_code_hash bytea unique check (octet_length(recovery_code_hash) = 32),
  display_name text check (char_length(display_name) between 1 and 64),
  avatar_preset text check (avatar_preset in ('sunny', 'berry', 'mint', 'cocoa', 'sky', 'plum')),
  claimed_by_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint guest_sessions_expiry check (expires_at > created_at)
);
create index guest_sessions_expires_at_idx on public.guest_sessions (expires_at);
create index guest_sessions_claimed_by_idx on public.guest_sessions (claimed_by_user_id) where claimed_by_user_id is not null;

-- ---------------------------------------------------------------------------
-- Commerce foundation (no payment provider integrated yet; see docs/ROADMAP.md)
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique check (sku ~ '^[a-z0-9_.-]{3,64}$'),
  kind public.product_kind not null,
  name_key text not null,
  price_minor integer not null check (price_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- set null (not cascade) so financial records survive account deletion in anonymised form.
  user_id uuid references public.users (id) on delete set null,
  status public.order_status not null default 'pending',
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor integer not null check (subtotal_minor >= 0),
  total_minor integer not null check (total_minor >= 0),
  provider text check (char_length(provider) <= 32),
  provider_ref text check (char_length(provider_ref) <= 128),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_provider_ref_unique unique (provider, provider_ref),
  constraint orders_paid_at check ((status = 'paid') <= (paid_at is not null))
);
create index orders_user_id_idx on public.orders (user_id);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null check (quantity between 1 and 100),
  unit_price_minor integer not null check (unit_price_minor >= 0),
  total_minor integer not null check (total_minor >= 0),
  created_at timestamptz not null default now(),
  constraint order_items_total check (total_minor = quantity * unit_price_minor)
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  order_item_id uuid unique references public.order_items (id) on delete set null,
  source text not null check (source in ('purchase', 'grant', 'promo')),
  quantity integer not null default 1 check (quantity >= 0),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
create index entitlements_user_id_idx on public.entitlements (user_id);

-- ---------------------------------------------------------------------------
-- Catalogs
-- ---------------------------------------------------------------------------
create table public.room_themes (
  id text primary key check (id ~ '^[a-z0-9_]{3,48}$'),
  event_type public.event_type not null,
  name_key text not null,
  description_key text not null,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  product_id uuid references public.products (id) on delete set null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Gift *products* (catalog) are modelled separately from gift *instances* (room_gifts)
-- so premium gifts can later be backed by products + entitlements.
create table public.gifts_catalog (
  id text primary key check (id ~ '^[a-z0-9_]{3,48}$'),
  name_key text not null,
  icon text not null check (char_length(icon) <= 16),
  is_free boolean not null default true,
  product_id uuid references public.products (id) on delete set null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint gifts_catalog_paid_has_product check (is_free or product_id is not null)
);

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- Display/navigation identifier only. NOT an authorization secret (see docs/SECURITY.md).
  slug text not null unique check (slug ~ '^[a-z0-9-]{6,48}$'),
  event_type public.event_type not null default 'birthday',
  title text not null check (char_length(title) between 1 and 120),
  honoree_name text not null check (char_length(honoree_name) between 1 and 80),
  theme_id text not null references public.room_themes (id),
  cake_style text not null check (cake_style in ('classic_vanilla', 'berry_dream', 'chocolate_gold')),
  decoration text not null check (decoration in ('balloons_pastel', 'balloons_gold', 'fairy_lights')),
  status public.room_status not null default 'open',
  privacy public.room_privacy not null default 'invite_link',
  -- scrypt hash string ("scrypt$N$r$p$salt$hash"); never the code itself.
  access_code_hash text check (char_length(access_code_hash) <= 255),
  host_user_id uuid references public.users (id) on delete set null,
  host_guest_session_id uuid references public.guest_sessions (id) on delete set null,
  capacity smallint not null default 20 check (capacity between 2 and 20),
  locked boolean not null default false,
  gifts_enabled boolean not null default true,
  chat_enabled boolean not null default true,
  starts_at timestamptz,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  locale text not null default 'en' check (locale in ('en', 'vi', 'ja')),
  -- Public share-preview controls (what a link unfurl may show). Off-by-default for the name.
  share_preview_enabled boolean not null default true,
  share_preview_show_honoree boolean not null default false,
  -- Guest-to-host conversion attribution: the room in which this host was previously a guest.
  created_from_room_id uuid references public.rooms (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null,
  deleted_at timestamptz,
  constraint rooms_access_code_matches_privacy check ((privacy = 'access_code') = (access_code_hash is not null)),
  constraint rooms_has_owner check (
    host_user_id is not null or host_guest_session_id is not null or status in ('archived', 'deleted')
  ),
  constraint rooms_expiry check (expires_at > created_at)
);
create index rooms_host_user_id_idx on public.rooms (host_user_id) where host_user_id is not null;
create index rooms_host_guest_session_id_idx on public.rooms (host_guest_session_id) where host_guest_session_id is not null;
create index rooms_expires_at_idx on public.rooms (expires_at);
create index rooms_status_idx on public.rooms (status);
create index rooms_created_from_room_id_idx on public.rooms (created_from_room_id) where created_from_room_id is not null;
create trigger rooms_updated_at before update on public.rooms
  for each row execute function public.set_updated_at();

create table public.room_objects (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  object_type text not null check (
    object_type in ('cake', 'gift_table', 'memory_wall', 'photo_booth', 'door', 'balloon_cluster', 'decoration')
  ),
  preset_key text not null check (char_length(preset_key) between 1 and 48),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  constraint room_objects_unique unique (room_id, object_type, preset_key)
);

create table public.room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  role public.participant_role not null default 'guest',
  display_name text not null check (char_length(display_name) between 1 and 64),
  avatar_preset text not null check (avatar_preset in ('sunny', 'berry', 'mint', 'cocoa', 'sky', 'plum')),
  invitation_id uuid, -- FK added below (invitations references participants)
  muted boolean not null default false,
  first_joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_interaction_at timestamptz,
  removed_at timestamptz,
  removed_by_participant_id uuid references public.room_participants (id) on delete set null,
  constraint room_participants_identity check (guest_session_id is not null or user_id is not null),
  constraint room_participants_guest_unique unique (room_id, guest_session_id),
  constraint room_participants_user_unique unique (room_id, user_id)
);
-- Exactly one host per room.
create unique index room_participants_one_host_idx on public.room_participants (room_id) where role = 'host';
create index room_participants_room_last_seen_idx on public.room_participants (room_id, last_seen_at);

-- Invitation grants. The URL carries an opaque token; only SHA-256(token) is stored.
-- Each participant can mint their own invitation for attribution (who invited whom).
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  created_by_participant_id uuid references public.room_participants (id) on delete set null,
  label text check (char_length(label) <= 60),
  channel text check (channel in ('link', 'qr', 'native_share', 'other')),
  max_uses integer check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  open_count integer not null default 0 check (open_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_use_limit check (max_uses is null or use_count <= max_uses)
);
create index invitations_room_id_idx on public.invitations (room_id);

alter table public.room_participants
  add constraint room_participants_invitation_fk
  foreign key (invitation_id) references public.invitations (id) on delete set null;
create index room_participants_invitation_id_idx on public.room_participants (invitation_id) where invitation_id is not null;

create table public.room_bans (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  participant_id uuid references public.room_participants (id) on delete set null,
  banned_by_participant_id uuid references public.room_participants (id) on delete set null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint room_bans_identity check (guest_session_id is not null or user_id is not null)
);
create unique index room_bans_guest_unique_idx on public.room_bans (room_id, guest_session_id) where guest_session_id is not null;
create unique index room_bans_user_unique_idx on public.room_bans (room_id, user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- Celebration content
-- ---------------------------------------------------------------------------
create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  author_participant_id uuid references public.room_participants (id) on delete set null,
  -- Snapshot so the wish keeps its byline if the participant record is purged.
  author_display_name text not null check (char_length(author_display_name) between 1 and 64),
  -- App enforces 500 graphemes; DB bound is a generous code-point safety net.
  body text not null check (char_length(body) between 1 and 2000),
  status public.moderation_status not null default 'pending',
  moderated_by_participant_id uuid references public.room_participants (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index wishes_room_status_created_idx on public.wishes (room_id, status, created_at);
create index wishes_author_idx on public.wishes (author_participant_id) where author_participant_id is not null;

create table public.room_gifts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  catalog_id text not null references public.gifts_catalog (id),
  sender_participant_id uuid references public.room_participants (id) on delete set null,
  sender_display_name text not null check (char_length(sender_display_name) between 1 and 64),
  message text check (char_length(message) between 1 and 800),
  status public.room_gift_status not null default 'sent',
  -- Client-generated key; prevents duplicate submissions on retry/double-tap.
  idempotency_key uuid not null,
  -- Future premium gifts consume an entitlement.
  entitlement_id uuid references public.entitlements (id) on delete set null,
  opened_at timestamptz,
  opened_by_participant_id uuid references public.room_participants (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint room_gifts_idempotency unique (room_id, sender_participant_id, idempotency_key),
  constraint room_gifts_opened check ((status = 'opened') <= (opened_at is not null))
);
create index room_gifts_room_created_idx on public.room_gifts (room_id, created_at);
create index room_gifts_sender_idx on public.room_gifts (sender_participant_id) where sender_participant_id is not null;

-- Ceremony summaries and their (low-frequency) phase transitions.
create table public.ceremonies (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  run integer not null check (run >= 1),
  kind text not null default 'birthday_candles' check (kind in ('birthday_candles')),
  started_by_participant_id uuid references public.room_participants (id) on delete set null,
  started_at timestamptz not null,
  completed_at timestamptz,
  final_phase public.ceremony_phase not null default 'PREPARING',
  participant_count integer check (participant_count >= 0),
  auto_blown boolean,
  constraint ceremonies_run_unique unique (room_id, run)
);

create table public.ceremony_events (
  id bigint generated always as identity primary key,
  ceremony_id uuid not null references public.ceremonies (id) on delete cascade,
  phase public.ceremony_phase not null,
  server_ts timestamptz not null,
  actor_participant_id uuid references public.room_participants (id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index ceremony_events_ceremony_ts_idx on public.ceremony_events (ceremony_id, server_ts);

-- ---------------------------------------------------------------------------
-- Media (object storage holds bytes; this table holds metadata + consent)
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  owner_participant_id uuid references public.room_participants (id) on delete set null,
  kind public.media_kind not null,
  status public.media_status not null default 'pending_upload',
  storage_bucket text not null check (char_length(storage_bucket) between 3 and 63),
  storage_key text not null check (char_length(storage_key) between 1 and 512),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 8388608),
  width integer check (width between 1 and 8192),
  height integer check (height between 1 and 8192),
  -- Explicit permission from the uploader that the photo may be shared with this party.
  consent_confirmed_at timestamptz not null,
  approved_by_participant_id uuid references public.room_participants (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint media_assets_storage_unique unique (storage_bucket, storage_key),
  constraint media_assets_approved check ((status = 'approved') <= (approved_at is not null))
);
create index media_assets_room_status_idx on public.media_assets (room_id, status);

create table public.memory_albums (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  cover_media_id uuid references public.media_assets (id) on delete set null,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_albums_published check ((status = 'published') <= (published_at is not null))
);
create trigger memory_albums_updated_at before update on public.memory_albums
  for each row execute function public.set_updated_at();

-- Objects that must be removed from object storage. Filled before cascading deletes so bytes
-- are never orphaned; drained by the storage purge worker.
create table public.storage_purge_queue (
  id bigint generated always as identity primary key,
  storage_bucket text not null,
  storage_key text not null,
  reason text not null check (reason in ('room_expired', 'user_request', 'moderation', 'retention')),
  enqueued_at timestamptz not null default now(),
  purged_at timestamptz,
  attempts integer not null default 0,
  constraint storage_purge_queue_unique unique (storage_bucket, storage_key)
);
create index storage_purge_queue_pending_idx on public.storage_purge_queue (enqueued_at) where purged_at is null;

-- ---------------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------------
create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  reporter_participant_id uuid references public.room_participants (id) on delete set null,
  target_type public.report_target_type not null,
  target_id text not null check (char_length(target_id) between 1 and 64),
  target_participant_id uuid references public.room_participants (id) on delete set null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 2000),
  -- Evidence snapshot (e.g. the reported chat line, which is otherwise not persisted).
  target_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(target_snapshot) = 'object'),
  status public.report_status not null default 'open',
  resolved_by text check (char_length(resolved_by) <= 64),
  resolution_note text check (char_length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint moderation_reports_one_per_target unique (reporter_participant_id, target_type, target_id)
);
create index moderation_reports_status_idx on public.moderation_reports (status, created_at);
create index moderation_reports_room_idx on public.moderation_reports (room_id);

-- ---------------------------------------------------------------------------
-- Product analytics (privacy-conscious; schema in packages/shared/src/analytics.ts)
-- ---------------------------------------------------------------------------
create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (
    event_name in (
      'landing_view', 'create_room_start', 'create_room_complete', 'invite_share', 'invite_link_open',
      'guest_join_success', 'guest_first_interaction', 'wish_sent', 'gift_sent', 'ceremony_started',
      'ceremony_completed', 'snapshot_created', 'snapshot_shared', 'guest_create_room', 'room_disconnect',
      'room_client_error'
    )
  ),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  -- Present only when the visitor granted analytics consent.
  anonymous_id uuid,
  -- No FK: analytics must not block room deletion and must not resurrect deleted rooms.
  room_id uuid,
  device_class text check (device_class in ('mobile', 'tablet', 'desktop', 'unknown')),
  locale text check (locale in ('en', 'vi', 'ja')),
  source text not null default 'web' check (source in ('web', 'game_server', 'api')),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  constraint analytics_events_clock_skew check (occurred_at <= received_at + interval '5 minutes')
);
create index analytics_events_name_time_idx on public.analytics_events (event_name, occurred_at);
create index analytics_events_room_idx on public.analytics_events (room_id) where room_id is not null;
create index analytics_events_anon_idx on public.analytics_events (anonymous_id, occurred_at) where anonymous_id is not null;
create index analytics_events_occurred_brin on public.analytics_events using brin (occurred_at);
