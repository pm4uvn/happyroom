# Explore dashboard (landing page)

The landing page (`/`) is an Explore dashboard: a 3D globe of public celebrations plus an equivalent, keyboard-friendly list with search and filters. Create / Join CTAs lead to the existing `/create` and `/join` flows.

## Data: what is real today

| Source                                 | What it returns                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/explore/celebrations`        | **Real data, honestly empty.** Rooms are private (invite link or access code); an invite link never makes a room public.                   |
| `GET /api/explore/celebrations?demo=1` | **Demo celebrations**: 27 labelled fixtures (`lib/server/explore-demo.ts`, `server-only`), never joinable, no invented participant counts. |

Demo mode is available when `NODE_ENV !== "production"`, or in production only with `EXPLORE_DEMO_ENABLED=true` (set for the E2E build). The UI labels it everywhere ("Demo celebrations" badge, notice, card status) and links back to the live view.

Public contract (`features/explore/model.ts`, Zod, unknown fields stripped): `id, name, celebrationType, countryCode, language, status, startsAt, participantCount (null unless counted by the server), capacity`. It never contains slugs, invitation tokens, access codes, honoree/host names or coordinates. A celebration is placed at its country's label point (country-level only).

## Missing before real discovery can be enabled

Not implemented on purpose, because these steps change privacy behaviour and need a product decision:

1. **Schema**: `rooms.discoverable boolean not null default false`, `rooms.public_name text` (host-written, separate from the private title that usually contains a person's name), `rooms.public_country char(2)` (host-chosen, never inferred). Plus a check that `discoverable` requires both.
2. **Host opt-in UI** in the create wizard and host controls. Off by default, explained in plain language, and revocable.
3. **Moderation**: review/report of public names, and age rules (no public rooms for under-13 hosts).
4. **Join path for discovered rooms** that keeps signed join grants, capacity and ban checks. Today the detail panel only says "ask the host for the invite link or room code".
5. **Real counts**: `participantCount` from the game server's presence, or left `null`.

Then set `DISCOVERY_ENABLED = true` and implement `listLiveCelebrations()` in `lib/server/discovery.ts`.

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
