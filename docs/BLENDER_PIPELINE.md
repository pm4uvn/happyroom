# Blender → HAPPYROOM World pipeline (Blender 5.x)

Two ways to bring Blender art into the world, both keeping gameplay ids stable:

1. **Per-object replacement** — set `"asset": { "url": "/assets/zones/central_plaza/fountain.glb" }` on a zone object (e.g. `fountain_main`). Its collider, interaction and id stay in the zone JSON.
2. **Whole-zone environment** — set `"assets": { "environment": "/assets/zones/central_plaza/plaza.glb" }`. The GLB renders instead of the procedural terrain/objects; zone JSON still provides colliders, spawns, portals and interactions. Missing files fall back to procedural geometry automatically (AssetManager HEAD check).

The private Birthday Room keeps its own pipeline: [ASSETS_GLB.md](ASSETS_GLB.md).

## Units, axes, origin

| Rule          | Value                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Unit scale    | 1 Blender unit = 1 metre (Scene → Units: Metric, scale 1.0)                                        |
| Up axis       | Model with Blender Z-up; export with **glTF "+Y Up"** (default) — runtime is Y-up                  |
| Forward       | The zone's +Z is "south" (towards the default camera). In Blender that is −Y.                      |
| Zone origin   | World origin = zone centre (0,0) at ground level; ground at Z = 0                                  |
| Object origin | Per-object assets: origin at the **base centre** of the object; the zone JSON `position` places it |
| Transforms    | Apply all transforms (Ctrl+A → All Transforms) before export                                       |
| Rotation      | Prefer 90° steps for anything with a box collider                                                  |

## Naming

- Object names = the zone object **id** for per-object replacement (`fountain_main`, `birthday_house`, `bench_ne`). Names are preserved at runtime (Three.js `name`), never renamed.
- Collision meshes: prefix `COL_` (or `UCX_`), simple boxes/cylinders, no materials. They are for authoring reference; the authoritative colliders are the `collider` entries in the zone JSON (the server never loads GLBs). Keep both in sync; `pnpm --filter @happyroom/world test` checks reachability.
- Spawn empties: `SPAWN_<id>`; portal empties: `PORTAL_<id>` (copy their X/Z into the zone JSON, remembering Blender −Y = zone +Z).
- Interactables: `INT_<id>`.

## Export settings

File → Export → glTF 2.0: Format **glb**; Include: Selected/Visible objects, Custom Properties; Transform: +Y Up; Geometry: Apply Modifiers, UVs, Normals; no cameras/lights (lighting comes from `environmentPreset`); Animation off for static props.

## Optimisation

- Budgets: per-zone environment ≤ 8 MB, textures ≤ 2K, ≤ 150 draw calls for the static environment.
- Compression: **Meshopt** is supported by the runtime loader. Draco is intentionally not loaded from third-party CDNs; self-host the decoder if needed.
- Recommended step when tooling is available: `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp`.

## Checklist for a new asset

1. Model, name and export as above into `apps/web/public/assets/zones/<zone>/`.
2. Reference it in the zone JSON (`asset.url` or `assets.environment`); bump the zone `version`.
3. Update colliders/spawns/portals in the JSON if the footprint changed.
4. `pnpm world:sync` (validates and rejects unreachable spawns/portals).
5. Run the world E2E (`pnpm test:e2e`) and check Settings → performance stats.
