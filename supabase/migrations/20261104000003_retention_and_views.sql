-- Retention policies, public/private data separation and analytics views.

-- ---------------------------------------------------------------------------
-- Public share-preview metadata (what a link unfurl / share landing may show).
-- Exposes no host identity, no participants, no access-code state beyond a boolean,
-- and the honoree name only if the host opted in.
-- Consumed server-side (service role); not granted to browser roles.
-- ---------------------------------------------------------------------------
create view public.room_share_previews
with (security_invoker = true) as
select
  r.slug,
  r.event_type,
  r.theme_id,
  case when r.share_preview_show_honoree then r.honoree_name end as honoree_name,
  r.starts_at,
  r.time_zone,
  r.status,
  (r.privacy = 'access_code') as requires_access_code
from public.rooms r
where r.share_preview_enabled
  and r.deleted_at is null
  and r.status not in ('archived', 'deleted');

revoke all on public.room_share_previews from anon, authenticated;
grant select on public.room_share_previews to service_role;

-- ---------------------------------------------------------------------------
-- Retention
--   rooms:            archived at expires_at, hard-deleted 30 days later (media queued for purge)
--   guest_sessions:   deleted after expires_at unless still hosting a live room
--   ceremony_events:  90 days
--   analytics_events: 13 months
--   moderation_reports: 365 days after resolution (open reports are kept)
--   storage_purge_queue: purged rows 30 days
-- Run hourly via pg_cron (Supabase) or the scheduled job described in docs/DATABASE.md.
-- ---------------------------------------------------------------------------
create or replace function public.happyroom_run_retention(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_archived integer;
  v_queued integer;
  v_rooms_deleted integer;
  v_guests_deleted integer;
  v_ceremony_events integer;
  v_analytics integer;
  v_reports integer;
  v_purge_rows integer;
begin
  update rooms
     set status = 'archived', ended_at = coalesce(ended_at, p_now)
   where expires_at < p_now and status not in ('archived', 'deleted');
  get diagnostics v_archived = row_count;

  -- Queue object-storage bytes before rows cascade away.
  insert into storage_purge_queue (storage_bucket, storage_key, reason)
  select m.storage_bucket, m.storage_key, 'room_expired'
    from media_assets m
    join rooms r on r.id = m.room_id
   where r.status in ('archived', 'deleted') and r.expires_at < p_now - interval '30 days'
  on conflict (storage_bucket, storage_key) do nothing;
  get diagnostics v_queued = row_count;

  delete from rooms
   where status in ('archived', 'deleted') and expires_at < p_now - interval '30 days';
  get diagnostics v_rooms_deleted = row_count;

  delete from guest_sessions g
   where g.expires_at < p_now
     and not exists (
       select 1 from rooms r
        where r.host_guest_session_id = g.id and r.status not in ('archived', 'deleted')
     );
  get diagnostics v_guests_deleted = row_count;

  delete from ceremony_events where server_ts < p_now - interval '90 days';
  get diagnostics v_ceremony_events = row_count;

  delete from analytics_events where occurred_at < p_now - interval '13 months';
  get diagnostics v_analytics = row_count;

  delete from moderation_reports
   where status <> 'open' and resolved_at < p_now - interval '365 days';
  get diagnostics v_reports = row_count;

  delete from storage_purge_queue where purged_at < p_now - interval '30 days';
  get diagnostics v_purge_rows = row_count;

  return jsonb_build_object(
    'rooms_archived', v_archived,
    'media_queued_for_purge', v_queued,
    'rooms_deleted', v_rooms_deleted,
    'guest_sessions_deleted', v_guests_deleted,
    'ceremony_events_deleted', v_ceremony_events,
    'analytics_events_deleted', v_analytics,
    'reports_deleted', v_reports,
    'purge_queue_rows_deleted', v_purge_rows
  );
end;
$$;

revoke execute on function public.happyroom_run_retention(timestamptz) from public, anon, authenticated;
grant execute on function public.happyroom_run_retention(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Internal analytics views (admin dashboard; service role only).
-- All are computed from real recorded events — no synthetic data.
-- ---------------------------------------------------------------------------
create view public.analytics_room_creation_funnel_daily with (security_invoker = true) as
select
  date_trunc('day', occurred_at)::date as day,
  count(*) filter (where event_name = 'landing_view') as landing_views,
  count(*) filter (where event_name = 'create_room_start') as create_starts,
  count(*) filter (where event_name = 'create_room_complete') as create_completes
from public.analytics_events
where event_name in ('landing_view', 'create_room_start', 'create_room_complete')
group by 1;

create view public.analytics_invite_conversion_daily with (security_invoker = true) as
select
  date_trunc('day', occurred_at)::date as day,
  count(*) filter (where event_name = 'invite_share') as invite_shares,
  count(*) filter (where event_name = 'invite_link_open') as invite_opens,
  count(*) filter (where event_name = 'guest_join_success') as guest_joins,
  count(*) filter (where event_name = 'guest_first_interaction') as guest_first_interactions
from public.analytics_events
where event_name in ('invite_share', 'invite_link_open', 'guest_join_success', 'guest_first_interaction')
group by 1;

create view public.analytics_ceremony_completion_daily with (security_invoker = true) as
select
  date_trunc('day', occurred_at)::date as day,
  count(*) filter (where event_name = 'ceremony_started') as started,
  count(*) filter (where event_name = 'ceremony_completed') as completed
from public.analytics_events
where event_name in ('ceremony_started', 'ceremony_completed')
group by 1;

create view public.analytics_guest_to_host_daily with (security_invoker = true) as
select
  date_trunc('day', occurred_at)::date as day,
  count(*) filter (where event_name = 'guest_join_success') as guest_joins,
  count(*) filter (where event_name = 'guest_create_room') as guests_became_hosts
from public.analytics_events
where event_name in ('guest_join_success', 'guest_create_room')
group by 1;

create view public.analytics_device_breakdown_daily with (security_invoker = true) as
select
  date_trunc('day', occurred_at)::date as day,
  event_name,
  coalesce(device_class, 'unknown') as device_class,
  count(*) as events
from public.analytics_events
group by 1, 2, 3;

create view public.analytics_client_errors_daily with (security_invoker = true) as
select
  date_trunc('day', occurred_at)::date as day,
  coalesce(properties ->> 'category', 'unknown') as category,
  coalesce(device_class, 'unknown') as device_class,
  count(*) as errors
from public.analytics_events
where event_name = 'room_client_error'
group by 1, 2, 3;

-- Live presence derived from participant heartbeats (game server updates last_seen_at at low frequency).
create view public.analytics_active_parties with (security_invoker = true) as
select
  p.room_id,
  count(*) as active_participants,
  max(p.last_seen_at) as last_activity_at
from public.room_participants p
join public.rooms r on r.id = p.room_id
where p.removed_at is null
  and p.last_seen_at > now() - interval '2 minutes'
  and r.status in ('open', 'live')
group by p.room_id;

-- Weekly host retention cohorts. Only consented visitors carry anonymous_id, so this
-- under-counts by design; the dashboard must label it accordingly.
create view public.analytics_host_retention_weekly with (security_invoker = true) as
with creates as (
  select anonymous_id, date_trunc('week', occurred_at)::date as week
    from public.analytics_events
   where event_name = 'create_room_complete' and anonymous_id is not null
   group by 1, 2
),
cohorts as (
  select anonymous_id, min(week) as cohort_week from creates group by 1
)
select
  c.cohort_week,
  ((cr.week - c.cohort_week) / 7) as weeks_since_first,
  count(distinct cr.anonymous_id) as hosts
from cohorts c
join creates cr on cr.anonymous_id = c.anonymous_id
group by 1, 2;

do $$
declare
  v record;
begin
  for v in select viewname from pg_views where schemaname = 'public' and viewname like 'analytics_%' loop
    execute format('revoke all on public.%I from anon, authenticated', v.viewname);
    execute format('grant select on public.%I to service_role', v.viewname);
  end loop;
end;
$$;
