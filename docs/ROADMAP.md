# HAPPYROOM — Roadmap, Backlog & Progress

Each item has acceptance criteria (AC). An item is only checked when its AC are verified by an automated test or a recorded manual check.

## Progress checklist

| Milestone                                                     | Status                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| M0 Inspect, verify dependencies, ADRs, acceptance tests       | ✅ Done                                                                             |
| M1 Monorepo, design system, landing page, database foundation | ✅ Done                                                                             |
| M2 Room creation & secure guest invitation flow               | ✅ Done (Redis limiter pending)                                                     |
| M3 3D room scene & avatar controls                            | ✅ Done (GLB loader ready; asset not yet supplied; 2D party mode pending)           |
| M4 Authoritative multiplayer                                  | ✅ Done for one process (load test + horizontal scaling pending)                    |
| M5 Gifts, wishes, chat, moderation                            | 🟡 Gifts, wishes, moderation done; chat, reports and photo uploads pending          |
| M6 Synchronised candle ceremony                               | ✅ Done                                                                             |
| M7 Snapshot, share card, viral tracking                       | 🟡 Snapshot, share card, invite attribution done; post-party CTA, reminders pending |
| M8 Analytics, tests, mobile perf, deployment                  | 🟡 Ingestion + views + E2E done; dashboard, load tests, deploy pending              |

Detailed evidence per feature: [MVP_GAP_ANALYSIS.md](MVP_GAP_ANALYSIS.md).

## M0 — Foundation ✅

- [x] **M0-01** Dependency versions verified against the npm registry and peer ranges; pinned exactly; documented in ARCHITECTURE §3.
- [x] **M0-02** ADRs 0001–0007 written.
- [x] **M0-03** Product, architecture, database, gameplay, security docs.

## M1 — Monorepo, design system, landing, DB ✅

- [x] **M1-01** pnpm + Turborepo workspace; `pnpm lint`, `typecheck`, `test`, `build` run across packages. _AC: all green locally._
- [x] **M1-02** `packages/shared`: enums, limits, UGC sanitisation, Zod schemas, protocol v1, analytics schema, catalogs, room layout. _AC: 39 unit tests incl. TS↔SQL enum parity._
- [x] **M1-03** `packages/game-core`: ceremony FSM, permissions, movement validation, token bucket. _AC: 34 unit tests._
- [x] **M1-04** `packages/ui`: brand tokens (Tailwind v4 `@theme`), Button, Badge, Card, Segmented, VisuallyHidden. _AC: a11y unit tests (3)._
- [x] **M1-05** Database: 22 tables, enums, constraints, indexes, RLS, retention, share-preview view, analytics views; local runner + seeds. _AC: 16 integration tests against PostgreSQL 17._
- [x] **M1-06** Landing page: hero with lazy 3D preview + SVG fallback, honest feature-flagged CTAs, 3 steps, theme preview, interactive demo, share link + QR, privacy section, final CTA. _AC: 28 Playwright tests across desktop + mobile Chromium._
- [x] **M1-07** i18n en/vi/ja with cookie + Accept-Language negotiation. _AC: key/placeholder parity tests; E2E language switching._
- [x] **M1-08** Analytics ingestion `/api/events` with consent model. _AC: E2E proves valid events stored, PII-bearing events dropped, landing_view recorded._
- [x] **M1-09** `/api/health` liveness/readiness; structured redacting logger; security headers. _AC: E2E + unit tests._
- [x] **M1-10** Docker Compose (Postgres + Redis), `.env.example`, CI workflow definition.

## M2 — Create room & secure invitations

- [x] **M2-01** Guest session service (create/rotate/expire, httpOnly cookie, hashed secret). _AC: integration tests for issuance, expiry, revocation._
- [x] **M2-02** `/create` 7-step wizard (event → honoree → theme → cake/decoration → time+timezone → privacy/access code → create). _AC: Playwright completes flow on mobile + desktop in < 30 s of interactions; Zod errors localised._
- [x] **M2-03** `POST /api/rooms`: validation, slug generation, room + host participant + default invitation in one transaction; recovery code shown once. _AC: integration test; rate limit 5/h per session+IP._
- [x] **M2-04** Host recovery flow (`/recover`), lost-session explanation before creation. _AC: recovering on a second browser grants host._
- [ ] **M2-05** Redis-backed rate limiter (shared across instances) with in-memory fallback in dev. _AC: limits hold across two processes._
- [x] **M2-06** Invite sharing: copy, native share, QR, per-participant invitations for attribution; `invite_share` / `invite_link_open`. _AC: tokens hashed; revoked/expired/max-used tokens rejected._
- [x] **M2-07** `/r/[slug]` landing: invitation confirmation, access-code prompt, privacy notice, name + avatar picker. _AC: slug without grant/code cannot proceed (E2E)._
- [x] **M2-08** Join grant signing (`JOIN_GRANT_SIGNING_KEY`), 15-min TTL. _AC: tampered/expired grants rejected (unit)._
- [x] **M2-09** Flip `NEXT_PUBLIC_FEATURE_CREATE_ROOM/JOIN_ROOM` once M2 E2E is green.

## M3 — 3D room & controls

- [x] **M3-01** Procedural room, cake, balloons, gift table, memory wall, photo booth, doorway, avatars (6 presets, 6 states), confetti.
- [x] **M3-02** Quality tiers incl. software-renderer detection; reduced motion; SVG fallback.
- [x] **M3-03** Local player controller: WASD/arrows, mobile joystick, client-side collision using shared layout. _AC: cannot leave bounds or enter obstacles (unit + E2E)._
- [x] **M3-04** Camera: isometric preset, bounded orbit (desktop), follow-player smoothing, ceremony glide.
- [x] **M3-05** Context actions near interactables (cake, gift table, memory wall, photo booth).
- [ ] **M3-06** 2D fallback party mode (list + actions) for no-WebGL devices.

## M4 — Authoritative multiplayer

- [x] **M4-01** `apps/game-server` Colyseus 0.18 app with `/health`, structured logs, graceful shutdown.
- [x] **M4-02** `PartyRoom`: grant verification in `onAuth`, `canJoin`, capacity 20, idle timeout, protocol version check.
- [x] **M4-03** Schema state (players, flags, ceremony), 20 Hz patches; movement via `validateMove`; corrections.
- [x] **M4-04** Client: interpolation buffer (~100 ms), reconciliation, connection status UI, reconnect with `allowReconnection(30s)`.
- [x] **M4-05** Emotes broadcast with rate limit; presence; host badge.
- [x] **M4-06** Integration tests with `@colyseus/testing`: join, movement validation, reconnect, host-only actions.
- [x] **M4-07** Two-browser Playwright test: both see each other move and emote.

## M5 — Gifts, wishes, chat, moderation

- [ ] **M5-01** Chat (sanitised, 8/10 s, not persisted), report/block.
- [x] **M5-02** Wishes persisted `pending` → host approval → memory wall.
- [x] **M5-03** Gifts with idempotency, table display, host opening.
- [x] **M5-04** Host controls: kick, ban, mute, lock, toggle gifts/chat, remove message.
- [ ] **M5-05** Media upload: presigned PUT to R2/S3, MIME/size validation, consent checkbox, host approval, signed GET URLs. (Local alternative: MinIO in compose.)
- [ ] **M5-06** Moderation reports with evidence snapshots.
- [ ] **M5-07** Delete own wish/photo; purge worker for `storage_purge_queue`.

## M6 — Ceremony

- [x] **M6-01** FSM with server timestamps, blow window, auto-blow, catch-up, restart (13 unit tests).
- [x] **M6-02** Server tick + broadcast + persistence of `ceremonies` / `ceremony_events`.
- [x] **M6-03** Client clock-offset estimation, synchronised countdown UI, camera glide, effects.
- [x] **M6-04** Late join / reconnect mid-ceremony tests; two-browser E2E ceremony.

## M7 — Snapshot, share card, growth

- [x] **M7-01** Canvas capture with notice to participants (`preserveDrawingBuffer` only during capture).
- [x] **M7-02** Branded share card (party name, snapshot, referral-safe preview URL), download + native share + fallback.
- [ ] **M7-03** Share landing with invitation confirmation; OG image without guest data.
- [ ] **M7-04** Post-party "Create your own room" CTA with `created_from_room_id` attribution; `guest_create_room`.
- [ ] **M7-05** Opt-in birthday reminders (consent + opt-out) — requires an email provider decision.

## M8 — Analytics, quality, deployment

- [ ] **M8-01** Internal admin dashboard over SQL views (auth-protected), no fabricated data.
- [ ] **M8-02** Optional PostHog forwarder behind consent.
- [ ] **M8-03** Load test 10/20 simulated clients per room (Colyseus loadtest), record CPU, memory, patch latency in `tests/load/RESULTS.md`.
- [ ] **M8-04** Mobile performance budget checks (Lighthouse CI on landing; fps sampling in room).
- [ ] **M8-05** CI green on GitHub Actions (workflow defined in M1, not yet run remotely).
- [ ] **M8-06** Nonce-based Content Security Policy.
- [ ] **M8-07** Deployment: web (Vercel or container), game server (Fly.io/Render/container), Supabase, R2; retention cron.
- [ ] **M8-08** Account deletion endpoint; data export.

## Known limitations (current)

- Rate limits are per process (web and game server); a multi-instance deployment needs the Redis limiter (M2-05).
- One game-server process; no horizontal scaling and **no load test yet** — the 20-participant target is enforced but not performance-validated.
- `HappyRoom_BirthdayStudio_V2.glb` is not in the repository; the procedural room is used until it is added (docs/ASSETS_GLB.md).
- No text chat, report/block UI, or photo uploads yet.
- Guest bans are per browser session and can be evaded with a new browser profile (mitigations: room lock, access codes).
- E2E covers Chromium (desktop + Pixel 7 emulation) only.
