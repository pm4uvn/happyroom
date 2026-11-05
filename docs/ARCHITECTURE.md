# HAPPYROOM — Architecture

Status legend: ✅ implemented & verified · 🟡 partially implemented · ⏳ planned (milestone noted)

## 1. System overview

```
             ┌───────────────────────── Browser (mobile-first) ─────────────────────────┐
             │ Next.js App Router UI · React Three Fiber scene · Colyseus client (M4)   │
             └──────┬──────────────────────────────┬─────────────────────────────┬──────┘
          HTTPS (REST/Server Actions)        WebSocket (M4)              signed media URLs (M5)
                    │                              │                              │
   ┌────────────────▼─────────────┐   ┌────────────▼──────────────┐   ┌───────────▼───────────┐
   │ apps/web (Next.js)           │   │ apps/game-server (Colyseus)│   │ Object storage (R2/S3) │
   │ • landing, create, join ✅/⏳ │   │ • authoritative rooms  ⏳  │   └───────────────────────┘
   │ • /api/health ✅             │   │ • game-core logic ✅       │
   │ • /api/events ✅             │   │ • join-grant verification ⏳│
   │ • room/invite APIs ⏳ (M2)   │   └──────┬────────────┬────────┘
   └───────┬─────────────┬────────┘          │            │
           │             │                   │            │
   ┌───────▼──────┐  ┌───▼─────────┐  ┌──────▼─────┐  ┌───▼─────────┐
   │ PostgreSQL ✅│  │ Redis ⏳(M2) │  │ PostgreSQL │  │ Redis       │
   │ (Supabase)   │  │ rate limits, │  │ low-freq   │  │ presence /  │
   │ RLS on all   │  │ presence     │  │ writes only│  │ scaling     │
   └──────────────┘  └─────────────┘  └────────────┘  └─────────────┘
```

**Trust boundaries**: browser ↔ web API (Zod-validated), browser ↔ game server (Zod-validated protocol + signed join grant), servers ↔ database (privileged connection, authorization performed in server code, RLS blocks browser keys).

## 2. Repository layout

```
apps/web            Next.js 16 App Router app (UI, API routes, 3D scene)
  app/              routes, layout, API handlers, server actions
  components/       site chrome (header, footer, consent, CTAs)
  features/         landing/, room-scene/, share/ (feature-sliced modules)
  hooks/ lib/       client hooks; server libs (env, db, logger, analytics, rate-limit)
  i18n/ messages/   locale negotiation; en / vi / ja catalogs
  e2e/              Playwright tests
apps/game-server    Colyseus authoritative server (M4) — see its README
packages/shared     Zod schemas, enums, protocol, analytics schema, catalogs, room layout
packages/game-core  Pure logic: ceremony state machine, permissions, movement, rate limiter
packages/ui         Design tokens (Tailwind v4 @theme) + shadcn-style primitives
supabase/           SQL migrations, seeds, Supabase CLI config
infra/db            Local-only Supabase auth shim for plain PostgreSQL
scripts/            db-migrate.mjs (migration runner)
tests/              Database integration tests (+ load tests in M8)
docs/               This documentation, ADRs
```

## 3. Technology choices & versions

All versions are pinned exactly. Rule used: newest release that is **at least ~2 weeks old** on 2026-11-04 and peer-compatible with the rest of the stack (verified with `npm view … peerDependencies`).

| Concern         | Choice                                                               | Version                                          | Rationale                                                                                 |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Runtime         | Node.js                                                              | 24 LTS (≥ 22.12)                                 | Current LTS; `Intl.Segmenter` for grapheme counting                                       |
| Package manager | pnpm                                                                 | 10.34.9                                          | Mature major; strict workspace linking                                                    |
| Monorepo        | Turborepo                                                            | 2.11.10                                          | Task graph + caching                                                                      |
| Language        | TypeScript                                                           | 5.9.3                                            | `typescript-eslint` supports `<6.1`; TS 7 (native port) not yet supported by lint tooling |
| Web             | Next.js                                                              | 16.4.2                                           | App Router, Turbopack builds; 16.4.5 was 1 day old                                        |
| UI runtime      | React                                                                | 19.3.1                                           | Within R3F peer range `>=19 <19.4`                                                        |
| Styling         | Tailwind CSS                                                         | 4.3.3                                            | CSS-first `@theme` tokens shared via `packages/ui`                                        |
| Primitives      | shadcn/ui pattern (cva, tailwind-merge 3.7.0, Radix Slot 1.2.4)      | —                                                | Owned source, no runtime lock-in                                                          |
| 3D              | three 0.186.1, @react-three/fiber 9.8.2, @react-three/drei 10.7.9    | —                                                | Mature R3F major for React 19                                                             |
| i18n            | next-intl                                                            | 4.14.9                                           | Supports Next 16; used without locale-prefixed URLs                                       |
| Validation      | Zod                                                                  | 4.6.7                                            | Matches Colyseus 0.18 peer `zod ^4.1.12`                                                  |
| DB driver       | postgres (porsager)                                                  | 3.4.9                                            | 4.0.0 was 6 days old                                                                      |
| DB              | PostgreSQL 17 / Supabase                                             | —                                                | RLS, `security_invoker` views                                                             |
| Realtime (M4)   | Colyseus                                                             | 0.18.x (core 0.18.19, schema 5.0.41, sdk 0.18.5) | Authoritative rooms, schema state sync, reconnection                                      |
| Tests           | Vitest 4.1.12, Playwright 1.64.1, Testing Library 16.3.0             | —                                                |                                                                                           |
| Lint            | ESLint 9.39.5 + eslint-config-next 16.4.2 + typescript-eslint 8.72.0 | —                                                | ESLint 10 not yet supported by all Next plugins                                           |

## 4. Architecture decision records

See [docs/adr](adr/): 0001 monorepo, 0002 authoritative realtime with Colyseus, 0003 guest identity & join grants, 0004 data access & RLS, 0005 procedural 3D assets, 0006 i18n without locale URLs, 0007 first-party analytics.

## 5. Identity, invitations and joining ✅ (implemented in M2/M4)

1. **Guest session**: on first create/join the web API mints a 32-byte random secret, stores `sha256(secret)` in `guest_sessions`, and sets it as an `httpOnly; Secure; SameSite=Lax` cookie. Sliding expiry (30 days).
2. **Host recovery**: room creation returns a one-time recovery code (shown once, `sha256` stored). Entering it on another device re-binds the host to a new guest session. Lost-session UX explains this before creation.
3. **Invitation grant**: an invite link is `/r/{slug}?i={token}`; only `sha256(token)` is stored with optional `max_uses`/`expires_at`/`revoked_at`. Each participant may mint their own invitation → attribution.
4. **Access code** (optional): verified with a constant-time scrypt comparison; rate-limited.
5. **Join grant** (`packages/shared/src/grant.ts`, server-only subpath `@happyroom/shared/grant`): after the web API authorises (session + invitation/code + ban/lock/capacity checks), it issues a short-lived (15 min) signed token `{roomId, participantId, role, displayName, avatar, protocol}` signed with `JOIN_GRANT_SIGNING_KEY`. The game server verifies the signature, expiry and audience, then re-checks bans/lock/capacity before admitting. The slug is never sufficient.

## 6. Realtime model ✅ (implemented; single process)

- One Colyseus room per party. Matchmaking filters on the `partyId` join option (**Colyseus 0.18 reserves the option name `roomId` and silently drops it**), and the room instance id is set to the party id so a second instance for the same party cannot exist. Capacity (≤ 20) is enforced in `onAuth`; `maxClients` is capacity + 5 so a full room never auto-locks into a duplicate instance.
- Code: `apps/game-server/src/party-room.ts` (lifecycle + handlers), `state.ts` (schema), `server.ts` (HTTP `/health` + transport), `db.ts`.
- Browser: `apps/web/features/party/connection.ts` keeps a mutable live store (read in `useFrame`) and a throttled snapshot for React; `party-players.tsx` does local prediction with the shared collision code, reconciliation on `correct`, and remote interpolation.
- **State** (Colyseus schema, delta-patched at 20 Hz): players (id, name, avatar, role, x, z, rotY, anim, muted), room flags (locked, giftsEnabled, chatEnabled), ceremony (phase, run, phaseStartedAt, phaseEndsAt, countdownEndsAt).
- **Messages**: validated with `clientMessageSchemas` (packages/shared/protocol.ts) before any handler. Unknown types are dropped and counted.
- **Movement**: clients predict locally and send `move` at ≤ 15 Hz; server runs `validateMove` (speed cap with tolerance, bounds, obstacle push-out) and corrects the client when needed. Remote avatars are rendered ~100 ms behind with interpolation.
- **Ceremony**: `game-core/ceremony.ts` is the single source of truth; server ticks it, broadcasts server timestamps, clients estimate clock offset via `ping`/`pong`.
- **Persistence**: only low-frequency facts (joins, wishes, gifts, ceremony phase changes, moderation) are written to PostgreSQL. Positions/emotes are never persisted.
- **Reconnect**: `allowReconnection(client, 30)`; the seat and avatar are retained; ceremony state is re-synced on rejoin.
- **Scaling**: single process for MVP. Horizontal scaling uses Colyseus' Redis presence/driver; must be load-tested (M8) before any capacity claim.

## 7. Analytics

- Schema: `packages/shared/src/analytics.ts` — 16 named events, strict per-event property schemas (unknown keys rejected, no free text).
- Ingestion: `POST /api/events` ✅ → validated → `analytics_events` table. Game-server events (M4+) are written server-side with `source = 'game_server'`.
- Consent: without consent, events carry no identifier and nothing is stored on the device except the consent choice; GPC/DNT are honoured as "denied". With consent, a random device-local UUID enables retention cohorts.
- Views: funnel, invite conversion, ceremony completion, guest→host, device breakdown, client errors, active parties, host retention (SQL views, service-role only). The admin dashboard (M7/M8) renders only these real views.
- PostHog: optional forwarder behind the same consent gate (M8). Not active today.

## 8. Observability

- Structured JSON logs (`apps/web/lib/logger.ts`) with key-based redaction of tokens, codes, cookies and grants.
- `GET /api/health` (liveness, reports dependency state) and `GET /api/health?ready=1` (readiness, 503 when a configured dependency is down) ✅.
- Game server: `/health`, room counts, message rates, rejected-message counters (M4).
- Client errors: categorised `room_client_error` events, never raw messages (M8).

## 9. Rendering & performance

- 3D bundle is lazy-loaded after first paint; the SVG fallback is the initial render and LCP never depends on WebGL.
- Quality tiers: GPU probe detects software renderers (SwiftShader/llvmpipe/WARP) and low-memory/low-core devices → low tier (no shadows, lower DPR, fewer particles). `PerformanceMonitor` drops DPR at runtime.
- Draw-call discipline: instancing for balloons, bunting, fairy lights and confetti; no textures; no external models.
- Reduced motion: `frameloop="demand"`, static poses, no confetti.
- Touch: orbit disabled on coarse pointers so pages scroll naturally; all scene actions are mirrored by accessible buttons.

## 10. Security headers

`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `COOP`, restrictive `Permissions-Policy`, HSTS in production, `X-Robots-Tag: noindex` + `Cache-Control: private, no-store` on `/r/*`, `no-store` on APIs. A nonce-based CSP is backlog item M8-06.
