# HAPPYROOM World — Architecture

> **Your World. Your People. Your Celebrations.** A persistent, expandable 3D social world. Zones are data; the engine is shared.

Status: first playable vertical slice implemented and verified — Login → Character → Central Plaza → movement → real multiplayer → Birthday House portal → private birthday room → back to the plaza at the door; second zone (Garden Terrace) loaded purely from registry data. Evidence: [§9](#9-verification).

## 1. Audit — what was reused

| Existing system                                                 | Reused as                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Colyseus game server (`apps/game-server`), `/health`, transport | Same process hosts a new `zone` room type next to `party`                                   |
| HMAC grants (`@happyroom/shared/grant`)                         | New **world grant** with a distinct audience (party ↔ world grants are not interchangeable) |
| Token-bucket limiter (`@happyroom/game-core`)                   | Per-player move / emote / chat / portal limits                                              |
| Procedural avatars (6 presets) + DOM label layer                | Player avatars, name tags, emote bubbles (+ new `run` animation)                            |
| Live-store / UI-snapshot connection pattern                     | `ZoneConnection` (presence)                                                                 |
| Birthday room system (create / join / party server)             | Entered from the Birthday House; **parties are not public zones**                           |
| PostgreSQL + migration runner, i18n, E2E harness                | Extended (migration 0004, `world:sync`, `world` namespace, `world.spec.ts`)                 |

Not reusable: the birthday room's movement/collision (hard-wired to one layout) → replaced by data-driven `@happyroom/world`.

## 2. Packages and modules

```
packages/world                 shared by browser AND server (one truth for zones and collision)
  src/zone-schema.ts           ZoneDefinition (Zod) — the zone data contract
  src/collision.ts             CollisionSystem: circles + boxes from data, validateZoneMove, safeSpawn,
                               reachability flood-fill
  src/protocol.ts              world realtime messages, avatars, age bands, chat screen
  zones/*.zone.json            authored zones (Central Plaza, Garden Terrace)
scripts/world-sync.mjs         ZoneRegistry publisher: validate → reachability check → upsert DB
apps/game-server/src/zone-room.ts   authoritative zone instances
apps/web/features/world/
  engine/event-bus.ts          WorldEventBus
  engine/zone-registry.ts      ZoneRegistry (client, cached, schema-validated)
  engine/asset-manager.ts      AssetManager (GLB, ref-counted, disposes GPU memory)
  engine/zone-connection.ts    ZoneMatchmaker + PlayerPresenceManager
  engine/character-controller.ts  CharacterController (pure; camera-relative, sprint, collision)
  engine/interaction.ts        WorldInteractionSystem + PortalSystem (proximity over zone data)
  engine/input.ts              keyboard / joystick / accessible buttons → one input state
  scene/world-scene.tsx        R3F scene, CameraController, remote interpolation, StatsProbe
  scene/zone-environment.tsx   ZoneLoader rendering: environment presets, terrain, GLB-or-procedural
  scene/object-library.tsx     procedural stand-ins per object type (stable ids)
  world-client.tsx             WorldManager + HUD
```

| Requested module       | Implementation                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| WorldManager           | `world-client.tsx` (`WorldClient`): enter/transition/leave, portal routing, HUD state          |
| ZoneRegistry           | DB `world_zones` (runtime) ← `world:sync` ← JSON; client `ZoneRegistry`                        |
| ZoneLoader             | `ZoneConnection.enter` (definition + grant) + `ZoneEnvironment` (render) with loading progress |
| AssetManager           | `engine/asset-manager.ts` (GLTFLoader + Meshopt, ref counts, dispose)                          |
| CharacterController    | `engine/character-controller.ts`                                                               |
| CameraController       | `scene/world-scene.tsx` (follow, orbit/zoom limits, obstruction: raise then pull-in)           |
| CollisionSystem        | `packages/world/src/collision.ts` (client prediction + server authority)                       |
| PortalSystem           | zone `portals[]` + `findFocus` + server `usePortal` proximity check                            |
| WorldInteractionSystem | object `interaction` data + `findFocus` + E key / button                                       |
| PlayerPresenceManager  | `ZoneConnection.live` / `players` (server-confirmed players only)                              |
| ZoneMatchmaker         | `POST /api/world/enter` → world grant → Colyseus `joinOrCreate("zone", {zoneId})`              |
| WorldEventBus          | `engine/event-bus.ts`                                                                          |

## 3. Zones are data

A zone = one JSON file validated by `zoneDefinitionSchema`: `zoneId, worldId, displayName{en,vi,ja}, version, bounds, environmentPreset, maxPlayers, publishedStatus, permissions{public, chat, minAgeBand}, assets{environment, collision, navmesh}, spawnPoints[], portals[], terrain[], objects[], expansionAreas[]`.

Every object has a **stable id**, a `type` (procedural stand-in), optional `collider`, `occludesCamera`, `interaction`, and optional `asset` (GLB replacement). Gameplay references ids only, so art can be swapped without code changes.

**Adding a zone** (proved with Garden Terrace): write `packages/world/zones/<id>.zone.json` (+ optional GLB in `apps/web/public/assets/zones/`), add a portal to it from an existing zone, run `pnpm world:sync`. The sync refuses invalid data and zones where any spawn or portal is unreachable on foot. No engine, server or routing change.

## 4. Coordinates

Metres, **Y-up**, ground at y = 0 (glTF/Three.js convention; Blender's glTF exporter converts its Z-up). Facing: `rotY = 0` looks towards +Z; zone object `rotationY` is in degrees (90° steps keep box colliders exact), spawn `rotY` in radians. Camera yaw: camera sits at `player + (sin yaw, cos yaw)·d`.

## 5. Realtime model

- Room type `zone`, `filterBy(["zoneId"])`, `maxClients = zone.maxPlayers`. A full instance is locked by Colyseus and the matchmaker opens another (**sharding** — never one global scene). Verified: 45 clients → 2 instances of a 30-player plaza.
- `onAuth`: world grant (signature, expiry, audience, zone) + profile ban check. `onJoin`: safe spawn (requested spawn → last saved location → default; never inside geometry; spread from other players), reconnection seat reuse.
- State per player: `x, z, rotY, anim (idle|walk|run), emote, emoteSeq, connected` at 20 Hz patches. Clients predict locally (same collision code) and send moves at 12.5 Hz; the server enforces the run speed × 1.3 cap, bounds and colliders, and sends `correct` when it disagrees. Remote avatars are smoothed (~100 ms).
- Chat is delivered per recipient: never to/from blocked pairs, never to or from players with chat off (incl. all under-13 accounts), after sanitisation, a profanity screen and a 5-per-10-s limit. Chat is not persisted; reports store the reported line as evidence.
- Portals: client requests `usePortal`; the server checks the **authoritative** distance (radius + 1 m) before granting.
- Persistence: high-frequency transforms stay in memory. `player_locations` is written on join (current zone) and on leave (last position, or the portal's return spawn); a late leave from a previous zone can never overwrite the current one.
- Reconnect: 20 s seat; the SDK reconnects automatically.

## 6. Identity

`player_profiles` (unique case-insensitive display name, avatar, age band, chat and listing preferences) + `player_sessions` (opaque httpOnly cookie `hr_player`, SHA-256 stored). Sign-in methods: **guest** (authenticated guest, no credentials), **username + password** (scrypt, per-username rate limit, timing-equalised), **Google via Supabase Auth** (adapter implemented; enabled only with `AUTH_GOOGLE_ENABLED=true` + the provider configured in Supabase — currently **not configured, unverified**).

## 7. Birthday House

The house is a zone object with a portal of kind `birthday_house`. Granting it opens the menu (Create / Join / Return). Create/Join go to the existing private-party flows, carrying a "from world" flag so the party UI offers **Back to Plaza**; the plaza location was saved at the house's `returnSpawnId`, so players re-appear at the door. Parties remain private rooms reached by invitation or access code — they are never listed as world zones.

## 8. Performance

- Procedural geometry only (no textures); ~3 lights; shadows only on the high tier; DPR adapts via `PerformanceMonitor`; quality setting Auto / High / Battery saver (Auto detects software renderers, low memory, low core counts).
- Settings → "Show performance stats": FPS, draw calls, JS heap (Chromium) from the live renderer.
- Load results: [LOAD_TEST.md](LOAD_TEST.md).

## 9. Verification

| Suite                                                                                                                                                                                                                                                                                                         | Result                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `packages/world` unit (schema, both zones valid, reachability, collision, sprint cap, safe spawn)                                                                                                                                                                                                             | 12 passed                  |
| web unit (CharacterController, interaction/portal focus, event bus, …)                                                                                                                                                                                                                                        | 41 passed                  |
| game-server zone integration (auth incl. party-grant rejection, bans, presence, simultaneous movement, sprint cap, fountain collision, emotes, reconnect, location persistence, chat blocks/under-13/filter/rate-limit, portal proximity + return spawn, second zone from registry, sharding)                 | 11 passed (28 incl. party) |
| DB integration (world RLS, unique names, credential constraints, synced zones)                                                                                                                                                                                                                                | 19 passed                  |
| E2E `world.spec.ts` — two real browsers: sign-in (password + guest), unique names, same plaza, walk + sprint seen by the other, chat + report, reconnect, Birthday House → private party → back at the door, portal to Garden Terrace and back, persistence across reload, under-13 chat off, mobile joystick | 11 passed                  |
