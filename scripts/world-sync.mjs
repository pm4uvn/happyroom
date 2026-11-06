#!/usr/bin/env node
/**
 * Publish zone definitions (packages/world/zones/*.zone.json) into the database.
 *
 *   pnpm world:sync            validate + upsert every zone, its spawn points, portals and assets
 *
 * Validation uses the compiled @happyroom/world schema (build it first: pnpm --filter @happyroom/world build).
 * Re-running is idempotent; a world_versions row is added whenever the combined content changes.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Same root .env the web app, game server and db-migrate.mjs already load.
const rootEnv = path.join(root, ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const { parseZoneDefinition, buildZoneCollision, reachable } = await import(
  new URL("../packages/world/dist/index.js", import.meta.url).href
);

const url = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";
const sql = postgres(url, { max: 1, onnotice: () => {} });
const WORLD = { key: "happyroom", name: "HAPPYROOM World", defaultZone: "central_plaza" };

async function main() {
  const dir = path.join(root, "packages/world/zones");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".zone.json")).sort();
  const zones = [];
  for (const f of files) {
    const raw = await readFile(path.join(dir, f), "utf8");
    const zone = parseZoneDefinition(JSON.parse(raw));
    if (zone.worldId !== WORLD.key) throw new Error(`${f}: unknown world ${zone.worldId}`);
    // Every spawn and portal must be reachable on foot from the default spawn.
    const zc = buildZoneCollision(zone);
    const start = zone.spawnPoints.find((s) => s.default);
    const targets = [
      ...zone.spawnPoints,
      ...zone.portals.map((p) => ({ x: p.position[0], z: p.position[1] })),
    ];
    const ok = reachable(zc, start, targets);
    if (ok.includes(false)) throw new Error(`${f}: unreachable spawn/portal`);
    zones.push({ zone, hash: createHash("sha256").update(JSON.stringify(zone)).digest("hex") });
  }

  await sql.begin(async (tx) => {
    const [world] = await tx`
      insert into worlds (world_key, display_name, default_zone_key) values (${WORLD.key}, ${WORLD.name}, ${WORLD.defaultZone})
      on conflict (world_key) do update set display_name = excluded.display_name, default_zone_key = excluded.default_zone_key
      returning id`;
    for (const { zone, hash } of zones) {
      const [z] = await tx`
        insert into world_zones (world_id, zone_key, display_name, version, bounds, environment_preset, max_players,
                                 published_status, permissions, collision_asset_url, navmesh_asset_url, definition, content_hash)
        values (${world.id}, ${zone.zoneId}, ${tx.json(zone.displayName)}, ${zone.version}, ${tx.json(zone.bounds)},
                ${zone.environmentPreset}, ${zone.maxPlayers}, ${zone.publishedStatus}, ${tx.json(zone.permissions)},
                ${zone.assets.collision ?? null}, ${zone.assets.navmesh ?? null}, ${tx.json(zone)}, ${hash})
        on conflict (world_id, zone_key) do update set
          display_name = excluded.display_name, version = excluded.version, bounds = excluded.bounds,
          environment_preset = excluded.environment_preset, max_players = excluded.max_players,
          published_status = excluded.published_status, permissions = excluded.permissions,
          collision_asset_url = excluded.collision_asset_url, navmesh_asset_url = excluded.navmesh_asset_url,
          definition = excluded.definition, content_hash = excluded.content_hash, updated_at = now()
        returning id`;
      await tx`delete from zone_spawn_points where zone_id = ${z.id}`;
      for (const s of zone.spawnPoints) {
        await tx`insert into zone_spawn_points (zone_id, spawn_key, x, z, rot_y, is_default)
                 values (${z.id}, ${s.id}, ${s.x}, ${s.z}, ${s.rotY}, ${s.default})`;
      }
      await tx`delete from zone_portals where zone_id = ${z.id}`;
      for (const p of zone.portals) {
        await tx`insert into zone_portals (zone_id, portal_key, x, z, radius, target_kind, target_zone_key, target_spawn_key, return_spawn_key)
                 values (${z.id}, ${p.id}, ${p.position[0]}, ${p.position[1]}, ${p.radius}, ${p.target.kind},
                         ${p.target.kind === "zone" ? p.target.zoneId : null}, ${p.target.kind === "zone" ? p.target.spawnId : null},
                         ${p.returnSpawnId})`;
      }
      await tx`delete from zone_assets where zone_id = ${z.id}`;
      const assets = [
        ...Object.entries(zone.assets)
          .filter(([, v]) => v)
          .map(([k, v]) => ({ key: k, kind: k, url: v })),
        ...zone.objects.filter((o) => o.asset).map((o) => ({ key: o.id, kind: "object", url: o.asset.url })),
      ];
      for (const a of assets) {
        await tx`insert into zone_assets (zone_id, asset_key, kind, url, version) values (${z.id}, ${a.key}, ${a.kind}, ${a.url}, ${zone.version})`;
      }
      console.log(
        `[world] ${zone.zoneId} v${zone.version} (${zone.publishedStatus}) — ${zone.objects.length} objects, ${zone.portals.length} portals`,
      );
    }
    const combined = createHash("sha256")
      .update(zones.map((z) => z.hash).join(":"))
      .digest("hex");
    // World version = highest zone version; the per-zone list goes into notes.
    const version = zones
      .map((z) => z.zone.version)
      .sort()
      .at(-1);
    const notes = zones.map((z) => `${z.zone.zoneId}@${z.zone.version}`).join(", ");
    await tx`insert into world_versions (world_id, version, content_hash, notes)
             values (${world.id}, ${version}, ${combined}, ${notes})
             on conflict (world_id, content_hash) do nothing`;
  });
  console.log(`[world] synced ${zones.length} zone(s)`);
}

main()
  .catch((e) => {
    console.error(`[world] FAILED: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
