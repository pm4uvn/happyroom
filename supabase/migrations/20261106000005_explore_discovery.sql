-- Explore dashboard: real public-discovery opt-in.
--
-- Rooms remain private by default. A host must explicitly opt in (discoverable = true) and
-- provide a separate public name/country before a room can appear on the public dashboard;
-- an invite link alone never makes a room public (enforced by the check constraint below).
-- No column here ever exposes an invitation token, access code, recovery code or guest identity.

alter table public.rooms
  add column discoverable boolean not null default false,
  -- Host-written public name, deliberately separate from `title`/`honoree_name` (which usually
  -- name a real person and are never shown outside the private room).
  add column public_name text check (char_length(public_name) between 1 and 80),
  -- ISO 3166-1 alpha-2, host-chosen. Never inferred from a participant's IP or device.
  add column public_country text check (public_country ~ '^[A-Z]{2}$'),
  add column public_intro text check (char_length(public_intro) <= 280),
  add column accept_wishes boolean not null default true,
  add column show_participant_count boolean not null default false,
  add constraint rooms_discoverable_requires_public_fields check (
    not discoverable or (public_name is not null and public_country is not null)
  );

-- Fast lookup for the Explore API; tiny (discoverable rooms are rare today).
create index rooms_discoverable_idx on public.rooms (expires_at)
  where discoverable and deleted_at is null;

alter table public.wishes
  -- 'public': submitted from the Explore dashboard without joining the 3D room. Set once at
  -- insert time and never re-derived from author_participant_id, which may later turn NULL for
  -- a perfectly ordinary 'party' wish once its author's participant row is purged (see the
  -- "Snapshot so the wish keeps its byline" comment on author_display_name above) — conflating
  -- the two would make retention's normal ON DELETE SET NULL violate this constraint.
  add column source text not null default 'party' check (source in ('party', 'public')),
  add column visitor_guest_session_id uuid references public.guest_sessions (id) on delete set null,
  -- Client-generated; lets a retried submit (flaky network, double tap) land once.
  add column idempotency_key uuid;

create unique index wishes_idempotency_uq on public.wishes (room_id, idempotency_key)
  where idempotency_key is not null;
