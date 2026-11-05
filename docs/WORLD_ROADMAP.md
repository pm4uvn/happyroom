# HAPPYROOM World — Roadmap

Legend: ✅ done & verified by tests · 🟡 partial · ⏳ next · 🚫 blocked (external)

## Milestones of the first vertical slice

| Milestone                        | Status | Notes                                                                                                                                                                                                                                            |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1 Audit + reusable world engine | ✅     | 12 engine modules, see WORLD_ARCHITECTURE §2                                                                                                                                                                                                     |
| M2 Central Plaza rendered        | ✅     | 40 × 40 m, fountain, paths, trees, benches, flowerbeds, lamps, signposts, Birthday House, expansion areas; procedural stand-ins with stable ids                                                                                                  |
| M3 Login, avatar, movement       | ✅     | guest + username/password; Google adapter 🟡 (needs provider config); 6 avatars, unique names, age band; WASD/arrows, Shift sprint, joystick (rim = run), accessible hold buttons, camera orbit/zoom limits, obstruction handling, E to interact |
| M4 Real multiplayer presence     | ✅     | authoritative zone instances, sharding, interpolation, reconnect, validation, rate limits, connection indicator                                                                                                                                  |
| M5 Birthday House portal         | ✅     | Enter prompt → menu → existing private party → Back to Plaza at the door                                                                                                                                                                         |
| M6 Registry, second zone, tests  | ✅     | Garden Terrace from data only; load test recorded (LOAD_TEST.md)                                                                                                                                                                                 |

## Backlog

| ID   | Item                                      | Acceptance criteria                                                                                      |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| W-01 | Real Blender assets                       | Plaza objects replaced via `asset` field; ids unchanged; analysis matches colliders; E2E still green     |
| W-02 | Imported character rigs & animation clips | GLB avatars with idle/walk/run/emote clips mapped to the existing state names; fallback stays procedural |
| W-03 | Google sign-in live                       | Provider configured in Supabase; E2E against a test Google account (manual)                              |
| W-04 | Device performance run                    | FPS on 3 reference phones with 20 and 30 visible players, recorded in LOAD_TEST.md                       |
| W-05 | Avatar instancing / LOD                   | ≤ 150 draw calls with 30 players at low quality                                                          |
| W-06 | Horizontal scaling                        | Colyseus Redis presence + driver; two processes share matchmaking; load test across processes            |
| W-07 | Navmesh                                   | `assets.navmesh` consumed for click-to-move / NPC paths                                                  |
| W-08 | Moderator console                         | Review `player_reports`, ban profiles (`banned_at`), audit via `world_events`                            |
| W-09 | Friends & presence privacy                | Mutual friends; `show_in_player_list` honoured in a player directory (no unsolicited DMs)                |
| W-10 | Zone versioning / rollout                 | Clients reload when `zoneVersion` changes; staged publishing (`draft` → `published`) in an admin tool    |
| W-11 | Asset CDN + KTX2/Meshopt pipeline         | `gltf-transform` optimisation step in CI; size budget per zone                                           |
| W-12 | Age assurance & legal review              | COPPA / GDPR-K / Vietnam Decree 13 review before public launch (self-declared age band only today)       |

## Known constraints

- Docker Desktop must be running for the database (it stops when the machine sleeps; `start.bat` restarts it).
- Self-declared age band; no age verification.
- One game-server process; per-process rate limits.
- Duplicate sessions of one profile in _different_ instances of the same zone are possible (same instance is de-duplicated).
