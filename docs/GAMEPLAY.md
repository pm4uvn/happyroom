# HAPPYROOM — Gameplay & Room Design

## Room layout (single source of truth: `packages/shared/src/world.ts`)

Metres, Y-up, floor at y = 0, origin at room centre. Camera looks in from +X/+Z, so the back (-Z) and left (-X) walls are rendered.

| Element         | Position                                     | Purpose                                    |
| --------------- | -------------------------------------------- | ------------------------------------------ |
| Walkable bounds | x ∈ [-7, 7], z ∈ [-6, 6], avatar radius 0.35 | Server clamps every move                   |
| Door / spawn    | z ≈ 6; 10 spawn points z ∈ [3.2, 4.8]        | `chooseSpawnPoint` picks the least crowded |
| Cake table      | centre, 2 × 2 m obstacle                     | Ceremony focus, context action radius 2 m  |
| Gift table      | (-5.5, -1.5)                                 | Open gifts panel                           |
| Memory wall     | back wall                                    | Wishes & approved photos                   |
| Photo booth     | (5.7, -2.8)                                  | Snapshot capture                           |

All obstacles are axis-aligned rectangles shared by client prediction and server validation (`game-core/movement.ts`). A unit test guarantees no spawn point lies inside an obstacle.

## Controls (M3)

| Platform                      | Move                  | Act                                         | Camera                                                        |
| ----------------------------- | --------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| Desktop                       | WASD / arrow keys     | `E` or click on object, bottom action bar   | Drag to orbit (bounded), wheel zoom (bounded)                 |
| Mobile                        | Left virtual joystick | Right context-action button, bottom sheets  | Fixed isometric preset (orbit off to avoid gesture conflicts) |
| Keyboard-only / screen reader | Arrow keys            | Every scene action has an equivalent button | —                                                             |

## Avatars

6 presets (`sunny`, `berry`, `mint`, `cocoa`, `sky`, `plum`) with distinct body colours and accessories. States: idle, walk, wave, clap, dance, celebrate — procedural animation, so state changes are a single enum value on the wire. Name tags and emote bubbles are DOM overlays (full Unicode support). MVP customisation is limited to preset + display name (sanitised, ≤ 32 graphemes).

## Emotes & reactions

`wave 👋, clap 👏, dance 💃, celebrate 🥳, heart 💖, laugh 😂` (ids in `EMOTE_IDS`). Rate limit: 10 per 5 s per participant. Emotes are broadcast, never persisted.

## Birthday ceremony (implemented & unit-tested in `game-core/ceremony.ts`)

```
IDLE ──start (host)──▶ PREPARING (4 s, camera glides to cake)
     ──timer──▶ COUNTDOWN (3-2-1, 3 s; then up to 20 s "blow window")
     ──blowCandles (anyone, or host-only policy) / blow-window deadline (auto)──▶ CANDLES_OUT (1.5 s)
     ──timer──▶ CELEBRATION (10 s: confetti, balloons, all avatars celebrate)
     ──timer──▶ COMPLETE (snapshot prompt) ──restart (host)──▶ PREPARING (run + 1)
```

- All transitions carry server timestamps (`phaseStartedAt`, `phaseEndsAt`, `countdownEndsAt`). Clients render the countdown from their measured server-clock offset, so every guest sees "1" at the same moment.
- Blowing before the countdown reaches zero is rejected (`too_early`); only the first blow wins; late requests first apply elapsed timers.
- `tickCeremony` catches up through multiple phases if the server stalled, and is idempotent.
- Late joiners and reconnecting clients receive the current state and resume mid-phase.
- `run` increments on each start/restart so clients ignore stale events.
- Microphone "blow detection" is a future, opt-in enhancement (Permissions-Policy currently disables the microphone).

## Gifts

Free catalog: cake topper, flower bouquet, teddy bear, balloon bouquet, star, confetti box. Flow: choose → optional message (≤ 200 graphemes) → submit with client idempotency key → appears on the gift table → host opens (animation + reveal). Limits: 6 per minute per participant; DB unique key blocks duplicates; host can disable gifts room-wide.

## Wishes & memory wall

Text wishes (≤ 500 graphemes) are stored `pending`; host/co-host approves before they appear to everyone (the author always sees their own). Photos require explicit consent, JPEG/PNG/WebP ≤ 8 MiB, host approval, and are served via short-lived signed URLs.

## Landing preview (implemented)

The landing page reuses the real room scene with six local demo guests. It is explicitly labelled "Local preview · nothing is sent anywhere": blowing out candles, emotes and theme switching are local React state, not multiplayer.
