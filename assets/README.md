# Assets

No third-party models, textures, fonts files, music or sound effects are bundled. Everything visible in the 3D scene is generated in code from Three.js primitives (`apps/web/features/room-scene`). Web fonts (Nunito, Baloo 2 — SIL Open Font License) are self-hosted at build time by `next/font`.

| Folder         | Intended contents                                              | Current state                                  |
| -------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `rooms/`       | Authored GLB room shell(s), KTX2 textures, meshopt compression | Procedural (`room-shell.tsx`, `furniture.tsx`) |
| `avatars/`     | Rigged GLB avatars with shared skeleton                        | Procedural (`avatar.tsx`), animation by code   |
| `decorations/` | Balloons, banners, gift models                                 | Procedural, instanced                          |
| `animations/`  | Idle/walk/wave/clap/dance/celebrate clips                      | Procedural poses                               |

## Replacement candidates (when professional art is commissioned)

1. Avatars — biggest visual upgrade; keep the six preset ids and animation state names.
2. Cake & candles — hero object; keep candle count and flame anchor points.
3. Room shell — keep the footprint and obstacle rectangles in `packages/shared/src/world.ts` (server collision depends on them).

Requirements for any added asset: documented licence (CC0 / commissioned with transfer), source file, author, and an entry in this file. Audio must be original or CC0.
