# HAPPYROOM — Database

PostgreSQL 17 (Supabase-compatible). Source of truth: [`supabase/migrations`](../supabase/migrations). Status: ✅ migrations apply cleanly and are covered by 16 integration tests (`tests/integration/database.test.ts`).

## Migrations

| File                                     | Contents                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `20261104000001_core_schema.sql`         | 14 enums, 22 tables, constraints, indexes, `updated_at` triggers           |
| `20261104000002_row_level_security.sql`  | RLS on every table, revoked browser privileges, catalog/own-row policies   |
| `20261104000003_retention_and_views.sql` | `room_share_previews` view, `happyroom_run_retention()`, 8 analytics views |

Apply locally: `pnpm db:up && pnpm db:reset`. Against Supabase: `supabase db push` (identical SQL). The local runner (`scripts/db-migrate.mjs`) tracks checksums in `happyroom_internal.schema_migrations` and refuses edited, already-applied migrations. `--reset` only works against localhost.

On plain PostgreSQL, `infra/db/local-auth-shim.sql` creates `auth.users`, `auth.uid()` and the `anon` / `authenticated` / `service_role` roles. It is never applied when an `auth` schema already exists.

## Entity overview

```
auth.users 1─1 users ─┬─< orders ─< order_items >─ products ─┬─< room_themes
                      └─< entitlements >──────────────────────┴─< gifts_catalog
guest_sessions ─< rooms (host) ─┬─< room_participants ─< invitations (created_by)
                                ├─< invitations          room_participants >─ invitations (attribution)
                                ├─< room_objects
                                ├─< room_bans
                                ├─< wishes
                                ├─< room_gifts >─ gifts_catalog, entitlements
                                ├─< ceremonies ─< ceremony_events
                                ├─< media_assets ─ memory_albums (cover)
                                ├─1 memory_albums
                                └─< moderation_reports
rooms ─< rooms (created_from_room_id: guest→host attribution)
analytics_events (no FKs, by design)    storage_purge_queue (object-storage deletion queue)
```

## Key design rules

| Rule                                                                              | Where it is enforced                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Secrets stored only as hashes (`bytea` length 32, scrypt string for access codes) | column checks                                               |
| Access code present ⇔ privacy = `access_code`                                     | `rooms_access_code_matches_privacy`                         |
| Active rooms always have an owner                                                 | `rooms_has_owner`                                           |
| Exactly one host per room                                                         | partial unique index `room_participants_one_host_idx`       |
| Duplicate gift submissions rejected                                               | `room_gifts_idempotency (room_id, sender, idempotency_key)` |
| Money in integer minor units, totals consistent                                   | `price_minor >= 0`, `order_items_total` check               |
| Media needs explicit consent, allowed MIME, ≤ 8 MiB                               | `consent_confirmed_at not null`, MIME / size checks         |
| Analytics accepts known events and object properties only                         | `event_name` check, `jsonb_typeof` check                    |
| One report per reporter per target                                                | `moderation_reports_one_per_target`                         |
| UGC bylines survive participant deletion                                          | `author_display_name` / `sender_display_name` snapshots     |
| Positions/emotes never stored                                                     | not modelled at all                                         |

## Public vs private data

`room_share_previews` exposes only slug, event type, theme, start time/zone, status and whether a code is required; the honoree name appears only if the host opted in (`share_preview_show_honoree`, default false). It is service-role only — the web server decides what to render in link unfurls.

## Retention (`happyroom_run_retention(now)`)

| Data                        | Policy                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Rooms                       | archived at `expires_at` (default: event + 30 days), hard-deleted 30 days later          |
| Media bytes                 | queued in `storage_purge_queue` _before_ rows cascade; purge worker deletes objects (M5) |
| Guest sessions              | deleted after `expires_at` unless still hosting a live room                              |
| Ceremony events             | 90 days                                                                                  |
| Analytics events            | 13 months                                                                                |
| Resolved moderation reports | 365 days after resolution                                                                |

Schedule hourly: on Supabase with `pg_cron` — `select cron.schedule('happyroom-retention', '17 * * * *', $$select public.happyroom_run_retention()$$);` — or from a server cron calling the function with the service role. Scheduling is a deployment step (M8) and is not active yet.

## Deletion requests

Account deletion: delete `auth.users` row → cascades to `users`, `entitlements`, participants tied to the user; orders are kept with `user_id = null` for accounting. Guest-media deletion: mark `media_assets.status = 'deleted'`, enqueue the object in `storage_purge_queue`. API endpoints for both are backlog items M5-07 / M8-08.
