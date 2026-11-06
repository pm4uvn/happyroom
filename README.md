# HAPPYROOM

**Celebrate Together. Anywhere.** A web-first 3D social celebration platform: create a cozy birthday room, share one link, and celebrate live as avatars — no app install, no mandatory account.

> **Status:** the core product loop works end-to-end with real multiplayer — Create Room → Share Invite → Join → see each other move in real time → wishes, gifts, synchronized candle ceremony, party photo. Feature-by-feature evidence and remaining gaps: [docs/MVP_GAP_ANALYSIS.md](docs/MVP_GAP_ANALYSIS.md).

## Explore dashboard (landing)

The home page is a 3D globe of **public** celebrations, with real-time summary cards, search/filters, and "Send congratulations" for visitors — all opt-in. A room appears only after its host turns on public discovery from inside the party room (name + country, separate from the private title); "live" requires confirmed game-server presence, not just a database flag. Nothing is public until a host opts in, so on a fresh database the dashboard shows an honest empty state; `/?demo=1` previews clearly labelled demo celebrations (dev only, or `EXPLORE_DEMO_ENABLED=true`). Full details, exact metric definitions and known gaps: [docs/EXPLORE.md](docs/EXPLORE.md).

## HAPPYROOM World (new)

**Your World. Your People. Your Celebrations.** Open **http://localhost:3000/world** (or "World" in the header): sign in (guest or username + password), create a character (6 avatars, unique name, age group), and walk the 40 × 40 m **Central Plaza** with other real players. Walk to the **Birthday House**, press **E**, create or join a private party, then use **Back to Plaza** to reappear at its door. The east gate leads to the **Garden Terrace**, a second zone defined purely by data.

Controls: WASD / arrows · Shift = run · drag = look, wheel = zoom · E = interact · mobile joystick (push to the rim to run) · optional accessible move buttons and performance stats in Settings.

| World docs                                          |                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [WORLD_ARCHITECTURE.md](docs/WORLD_ARCHITECTURE.md) | engine modules, zones-as-data, realtime model, verification                        |
| [WORLD_ROADMAP.md](docs/WORLD_ROADMAP.md)           | milestones, backlog with acceptance criteria, constraints                          |
| [BLENDER_PIPELINE.md](docs/BLENDER_PIPELINE.md)     | Blender → GLB export rules (Y-up, metres, origins, `COL_`/`SPAWN_` names, Meshopt) |
| [LOAD_TEST.md](docs/LOAD_TEST.md)                   | measured 20 / 30 / 45-client results and what is not yet measured                  |

Add a zone: create `packages/world/zones/<id>.zone.json`, link a portal to it, run `pnpm world:sync` (validates the data and rejects unreachable spawns/portals). No engine changes.

Load test: `node tests/load/zone-load.mjs --clients 30 --seconds 30`.

## Quick start (Windows)

Double-click **`start.bat`**. It checks Node/pnpm/Docker, starts Docker Desktop if needed, creates `.env` (and a random `JOIN_GRANT_SIGNING_KEY`) if missing, installs dependencies on first run, starts PostgreSQL + Redis, applies migrations, then opens two windows (game server on :2567, web on :3000) and your browser. **`stop.bat`** stops everything (database data is kept).

To try multiplayer alone: create a room, then open the invite link in a second browser or a private window.

## Manual start (any OS)

```bash
pnpm install
cp .env.example .env                       # then set JOIN_GRANT_SIGNING_KEY (32+ random chars)
pnpm db:up && pnpm db:reset                # PostgreSQL :54329, Redis :63790, migrations + seeds
pnpm --filter @happyroom/shared --filter @happyroom/game-core build
pnpm --filter @happyroom/game-server dev   # ws://localhost:2567, health: /health
pnpm --filter @happyroom/web dev           # http://localhost:3000
```

The web app and game server both read the **root** `.env` (the web app also honours `apps/web/.env.local`). Both must share the same `JOIN_GRANT_SIGNING_KEY`.

## What works (verified)

| Area                                                                                                              | Verified by                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Create-room wizard → room, host, hashed invitation and recovery code in PostgreSQL                                | E2E + DB assertions                                                                      |
| Invite link / room code / access code; strangers without an invite are refused (API and UI)                       | E2E                                                                                      |
| Guest name + avatar picker, no account                                                                            | E2E                                                                                      |
| Signed join grants verified by the Colyseus game server                                                           | unit + integration                                                                       |
| Real multiplayer: join/leave, server-validated movement, avatar sync, emotes, reconnect, capacity, lock, kick/ban | 17 game-server integration tests; E2E with two independent browsers                      |
| Synchronized ceremony: host-only start, shared server-timed countdown, any guest blows, late join                 | integration + E2E                                                                        |
| Wishes (persisted, host approval, real-time) and free gifts (idempotent, host opens)                              | integration + E2E                                                                        |
| Party photo → branded 1200×1500 share card; others notified                                                       | E2E                                                                                      |
| Mobile: joystick drives authoritative movement, bottom actions, no overflow                                       | E2E (Pixel 7)                                                                            |
| Landing page, i18n en/vi/ja, analytics ingestion, health, security headers                                        | E2E                                                                                      |
| Blender GLB loader + node classifier (collision, spawns, interactables)                                           | unit tests; **real GLB not supplied yet** — see [docs/ASSETS_GLB.md](docs/ASSETS_GLB.md) |

Latest local results (2026-11-06): **155 unit**, **57 integration** (24 database + 33 game server incl. 11 world-zone + host-discovery/presence), **E2E**: landing + party + world + explore-live suites green (desktop + mobile). Lint, typecheck and production build pass. Note: run E2E with no other Playwright/agent sessions using the same folder — they share `test-results/` and CPU (`E2E_WORKERS=1` for slow machines).

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test             # unit tests (no services needed)
pnpm db:up && pnpm db:reset && pnpm test:integration # database + game-server integration (needs Docker)
pnpm --filter @happyroom/web exec playwright install chromium   # once
pnpm test:e2e                                        # starts its own game server (:2568) and web build (:3100)
```

## Environment variables

See [.env.example](.env.example). Required now: `DATABASE_URL`, `JOIN_GRANT_SIGNING_KEY` (shared by web + game server), `GAME_SERVER_PUBLIC_URL` (WebSocket URL browsers use), `NEXT_PUBLIC_APP_URL` (used to build invite links). Set `GAME_ALLOWED_ORIGINS` in production. Supabase keys are present for future registered login; the hosted Supabase database does not have the schema yet (apply `supabase/migrations` with `supabase db push` or `DATABASE_URL=<connection string> pnpm db:seed`).

## Repository

```
apps/web            Next.js 16: landing, create/join, room lobby, party HUD, 3D scene, API routes
apps/game-server    Colyseus 0.18 authoritative party server (+ integration tests)
packages/shared     Zod schemas, enums, protocol, join grants (server-only subpath), catalogs, layout
packages/game-core  Ceremony FSM, permissions, movement validation, rate limiting
packages/ui         Design tokens + accessible primitives
supabase/           Migrations, seeds
tests/integration   Database integration tests
docs/               Product, architecture (+ ADRs), database, gameplay, security, roadmap, gap analysis, GLB import
```

## Documentation

[Gap analysis](docs/MVP_GAP_ANALYSIS.md) · [Product requirements](docs/PRODUCT_REQUIREMENTS.md) · [Architecture](docs/ARCHITECTURE.md) · [ADRs](docs/adr) · [Database](docs/DATABASE.md) · [Gameplay](docs/GAMEPLAY.md) · [Security & safety](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md) · [GLB import](docs/ASSETS_GLB.md) · [Assets & licensing](assets/README.md)
