-- Row Level Security and grants.
--
-- Model (see docs/SECURITY.md):
--   * Every table in `public` has RLS ENABLED. No table relies on "nobody knows the URL".
--   * Browser clients (Supabase `anon` / `authenticated` roles) may only:
--       - read active public catalogs (themes, gifts, products),
--       - read/update their own `users` row (non-privileged columns),
--       - read their own orders, order items and entitlements.
--   * Everything room-related (rooms, participants, invitations, wishes, gifts, media, reports,
--     analytics, guest sessions) is written AND read through trusted server pathways
--     (Next.js route handlers / game server) using the service role, which bypasses RLS,
--     after the server has performed its own authorization checks.

-- Stop Supabase's default "grant everything to anon/authenticated" on future tables.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end;
$$;

revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

-- The service role is used only by trusted servers and bypasses RLS by design.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
-- RLS is ENABLED but not FORCED: the migration owner (postgres) must still run seeds and the
-- SECURITY DEFINER retention job. Browser roles never own tables, so they are always subject to RLS.

-- ---------------------------------------------------------------------------
-- Public catalogs (read-only, active rows only)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.room_themes to anon, authenticated;
create policy room_themes_public_read on public.room_themes
  for select to anon, authenticated using (active);

grant select on public.gifts_catalog to anon, authenticated;
create policy gifts_catalog_public_read on public.gifts_catalog
  for select to anon, authenticated using (active);

grant select on public.products to anon, authenticated;
create policy products_public_read on public.products
  for select to anon, authenticated using (active);

-- ---------------------------------------------------------------------------
-- Registered users: own row only
-- ---------------------------------------------------------------------------
grant select on public.users to authenticated;
grant update (display_name, preferred_locale, birthday_month, birthday_day, birthday_reminders_opt_in,
              reminders_consented_at) on public.users to authenticated;

create policy users_select_own on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy users_update_own on public.users
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Commerce: read own records; all writes happen server-side (payment webhooks).
-- ---------------------------------------------------------------------------
grant select on public.orders, public.order_items, public.entitlements to authenticated;

create policy orders_select_own on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

create policy order_items_select_own on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
  );

create policy entitlements_select_own on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));

-- All remaining tables intentionally have NO policies for anon/authenticated:
-- with RLS enabled and privileges revoked, they are unreachable from browser keys.
