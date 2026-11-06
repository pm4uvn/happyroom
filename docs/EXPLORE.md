# Explore dashboard (landing page)

The landing page (`/`) is an Explore dashboard: a 3D globe of public celebrations plus an equivalent, keyboard-friendly list with search and filters. Create / Join CTAs lead to the existing `/create` and `/join` flows.

## Data: what is real today

Public discovery is **real and live** (`DISCOVERY_ENABLED = true`), but strictly opt-in: a room shows up only after its host explicitly turns it on, from inside the party room (People panel → "Explore dashboard"), filling in a public name and country that are separate from the private room title and honoree name. An invite link never makes a room public. On a fresh database — or whenever nobody has opted in — the listing and the summary cards are honestly empty, never fabricated.

| Source                                                                    | What it returns                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/explore/celebrations`                                           | Opted-in rooms only. `status: "live"` requires **confirmed game-server presence** (someone is actually connected right now), not just a database flag; `status: "upcoming"` requires a real future `startsAt`. A room with neither is left out entirely rather than guessed.                                  |
| `GET /api/explore/summary`                                                | The four summary numbers (see below), each independently `{ value, status }` where status is `"ok"` or `"unavailable"`.                                                                                                                                                                                       |
| `GET /api/explore/celebrations?demo=1`, `GET /api/explore/summary?demo=1` | **Demo celebrations**: 27 labelled fixtures (`lib/server/explore-demo.ts`, `server-only`), never joinable, no invented participant counts. Available when `NODE_ENV !== "production"`, or in production with `EXPLORE_DEMO_ENABLED=true` (set for the E2E build).                                             |
| `POST /api/explore/wishes`                                                | Send congratulations without joining the 3D room. Always inserted as `pending`; only a host moderator (inside the party room) can approve it. Rate-limited per IP+room (`RATE_LIMITS.publicWish`), content-screened (`screenProfanity`, `containsLink`), deduplicated by a client-generated `idempotencyKey`. |

Public celebration contract (`features/explore/model.ts`, Zod, unknown fields stripped): `id, name, celebrationType, countryCode, language, status, startsAt, participantCount (null unless the host chose to show it), capacity, intro, acceptingWishes`. It never contains slugs, invitation tokens, access codes, recovery codes, honoree/host names or exact coordinates — a celebration sits at its country's label point only (`rooms.public_country`, host-chosen, never inferred from IP/device).

### The four summary numbers (`lib/server/discovery.ts`)

| Metric                    | Definition                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Celebrating now**       | Discoverable rooms with at least one client connected right now (confirmed presence).                                                     |
| **People celebrating**    | Sum of connected clients across those same live rooms.                                                                                    |
| **Countries celebrating** | Distinct host-chosen countries among those live rooms.                                                                                    |
| **Wishes shared**         | Approved (not pending) wishes whose room is _currently_ discoverable — all-time, not session-scoped; a room that opts out stops counting. |

The first three depend on the game server's presence snapshot; if it cannot be reached, all three report `{ value: null, status: "unavailable" }` rather than a guessed zero. "Wishes shared" comes from the database alone and stays `"ok"` even then. The dashboard polls `/api/explore/summary` every 15 s (paused while the tab is hidden, refetched immediately when it becomes visible) — a bounded poll, not a push subscription, per the "no per-card WebSocket" constraint.

### Presence: how "live" is confirmed

`apps/game-server` exposes `GET /internal/presence` (party rooms only, never zone/world rooms), protected by the same shared secret (`JOIN_GRANT_SIGNING_KEY`) both servers already hold — it is not meant to be reachable from the public internet. `apps/web`'s `lib/server/presence.ts` calls it with a 2.5 s timeout and caches the result for 4 s per process. `rooms.id` **is** the Colyseus `roomId` for party rooms (`this.roomId = row.id` in `party-room.ts`), so the two line up with no extra mapping table.

### Public wishes end-to-end

A visitor's wish is inserted straight into the existing `wishes` table (`source = 'public'`, `author_participant_id = null`) — the same table and the same host-approval message (`moderateWish`) the in-room wish flow already uses, so no new moderation UI was needed. The one gap that needed closing: a host already _inside_ the party room only received pending wishes on join (`sendPendingWishes`), so `party-room.ts` now also polls for new `source = 'public'` pending wishes every 5 s (only while `discoverable`) and pushes them live via the existing `wishPending` message. A host who opens the room later still gets them immediately either way.

### Host opt-in (`party.discovery`, `party-room.ts`'s `hostDiscovery` message)

Off by default. Host-only (`room.discovery` permission, `packages/game-core`). Turning it off clears `public_name` / `public_country` / `public_intro` server-side and the room disappears from the public API, the summary and the poll on the visitor's very next request — there is no cache to invalidate on that path. Enabling it requires a public name and country (enforced again on the server, not just the form); `rooms_discoverable_requires_public_fields` enforces the same rule at the database layer as a last resort.

## Known gaps (acknowledged, not hidden)

- **No public "Join" path.** The detail panel still only says "ask the host for the invite link or room code" — joining a discovered room without an invite was out of scope here (it would need its own capacity/ban/grant story on top of discovery).
- **No age gating for public listing.** Party rooms carry no age-band data today (that concept exists only in HAPPYROOM World's player profiles), so there is nothing to gate on yet.
- **No moderation queue for public names/intros beyond the existing wish/report tooling.** A host can type anything into "public name" / "intro"; it goes through the same profanity/link screen as wishes do, but there is no review queue.
- **Presence poll, not push, for public wishes** (5 s) and **summary poll, not push** (15 s): simple and bounded, at the cost of a few seconds of latency — acceptable for a "congratulations" message, called out explicitly rather than described as instant.

## Globe

- `features/explore/globe/*`: R3F scene, lazy-loaded with `next/dynamic({ ssr: false })` after the server-rendered page.
- **Earth**: a shader sphere using a land mask drawn at runtime on a canvas, with vector coastlines, borders and a graticule, plus an atmosphere shell.
- **Markers**: clustered on the sphere by zoom level; hover shows a preview, click selects.
- **Camera rig**: drag, zoom within limits, slow auto-rotation that pauses on interaction, fly-to.
- **Detail levels**: Natural Earth 1:50m on capable devices; 1:110m on low-end, mobile or software renderers (about 22 KB gzipped).
- **Rendering cost**:
  - DPR is capped (2 on the high tier, 1.5 on the low tier) and lowered further by `PerformanceMonitor`.
  - Rendering stops when the globe is off-screen or the tab is hidden.
  - With reduced motion, the globe renders on demand and auto-rotation and pulses are off.
- **Without WebGL**: a fallback message appears and the list keeps every action.
- **Data**: `scripts/geo-build.mjs` builds `apps/web/public/geo/*.json` and `features/explore/data/countries.json` from Natural Earth GeoJSON.

## Credits

Map data: **Made with Natural Earth** (public domain), https://www.naturalearthdata.com. The data is stored in the repository; nothing is loaded from third-party hosts at runtime.
