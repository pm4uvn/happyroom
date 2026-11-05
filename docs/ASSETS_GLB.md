# Importing `HappyRoom_BirthdayStudio_V2.glb`

Status: the loader and analyzer are implemented and unit-tested; the actual file is **not in the repository yet**, so rendering of the real asset is unverified. The procedural room keeps working until the file is added.

## 1. Add the file

```
apps/web/public/assets/rooms/HappyRoom_BirthdayStudio_V2.glb
```

That's all. Party rooms (`/r/...`) call `HEAD /assets/rooms/HappyRoom_BirthdayStudio_V2.glb`; if it exists the GLB is rendered with its own geometry and materials (`features/room-scene/glb/gltf-room.tsx`), otherwise the procedural room is used. The landing preview always stays procedural (fast first load).

## 2. Blender export settings

- Format: **glTF Binary (.glb)**, +Y Up (default), units **metres**, apply transforms.
- Include: selected/visible objects, custom properties optional, **object names on**.
- Compression: none or **Meshopt** (supported). **Draco is not enabled** — the app does not fetch decoders from third-party CDNs. If Draco is required, self-host the decoder under `/draco/` and change `useGLTF(ROOM_ASSET_URL, false, true)` to `useGLTF(ROOM_ASSET_URL, "/draco/", true)`.
- Textures: prefer ≤ 2K, KTX2/WebP where possible; keep the file small (target < 8 MB) for phones.
- Licence: record author/licence in `assets/README.md`.

## 3. Naming contract (names are preserved, never renamed)

Nodes are classified by name (`classifyNodeName`), first match wins:

| Role         | Pattern                              | Example                                                         | Used for                        |
| ------------ | ------------------------------------ | --------------------------------------------------------------- | ------------------------------- |
| collider     | prefix `COL_` / `UCX_`               | `COL_CakeTable`                                                 | Floor footprint for collision   |
| spawn        | prefix `SPAWN_`                      | `SPAWN_01` (empty)                                              | Spawn points                    |
| interactable | prefix `INT_` + keyword              | `INT_GiftTable`, `INT_MemoryWall`, `INT_PhotoBooth`, `INT_Door` | Context actions                 |
| flame        | `flame`, `fire`                      | `Candle_Flame_03`                                               | Hidden when candles go out      |
| candle       | `candle`                             | `Candle_03`                                                     |                                 |
| cake         | `cake`                               | `Cake_Main`                                                     | Cake hit area / ceremony focus  |
| furniture    | `table`, `chair`, `sofa`, `booth`, … | `Table_Gift`                                                    | Fallback colliders if no `COL_` |
| gift         | `gift`, `present`                    | `Gift_Box_Red`                                                  |                                 |
| floor / wall | `floor`, `rug` / `wall`, `window`    | `Floor_Wood`, `Wall_Back`                                       | Room bounds                     |
| decoration   | `balloon`, `banner`, `light`, …      | `Balloon_Cluster_A`                                             |                                 |

Unclassified meshes are rendered normally and listed in the analysis for review.

## 4. Coordinate mapping

Game space: metres, Y-up, floor at y = 0, room centred on the origin, camera looking in from +X/+Z, door on the +Z side. If the model is authored elsewhere, adjust `ROOM_ASSET_TRANSFORM` (scale, position, rotationY) in `glb/room-asset.ts` rather than editing the model.

## 5. Collision and spawn points (server authority)

The **server** validates movement against `packages/shared/src/world.ts` (`BIRTHDAY_ROOM`), shared with client prediction. When the GLB loads in development, the browser console prints its analysis (bounds, `COL_` rectangles, `SPAWN_` points, interactable positions). Copy those values into `BIRTHDAY_ROOM` so client, server and art agree, then run `pnpm --filter @happyroom/game-core test` (it checks spawns are never inside obstacles).

## 6. Verify

1. `start.bat`, create a room, enter it — the Blender room should render.
2. Console shows the analysis; check cake/candle/flame names were found.
3. Start the ceremony — flames hide on CANDLES_OUT.
