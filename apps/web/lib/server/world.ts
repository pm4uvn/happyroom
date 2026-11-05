import "server-only";
import { parseZoneDefinition, type ZoneDefinition } from "@happyroom/world";
import type { Db } from "./types";

/** ZoneRegistry (server side): published zone definitions from the database (written by world:sync). */
export async function listPublishedZones(db: Db) {
  const rows = await db`
    select z.zone_key, z.display_name, z.max_players, z.version, w.world_key, w.default_zone_key
      from world_zones z join worlds w on w.id = z.world_id
     where z.published_status = 'published' order by z.zone_key`;
  return rows.map((r) => ({
    zoneId: r.zone_key as string,
    displayName: r.display_name as Record<string, string>,
    maxPlayers: r.max_players as number,
    version: r.version as string,
    worldId: r.world_key as string,
    isDefault: r.zone_key === r.default_zone_key,
  }));
}

export async function getPublishedZone(db: Db, zoneId: string): Promise<ZoneDefinition | null> {
  if (!/^[a-z0-9_]{2,48}$/.test(zoneId)) return null;
  const rows =
    await db`select definition from world_zones where zone_key = ${zoneId} and published_status = 'published'`;
  return rows[0] ? parseZoneDefinition(rows[0].definition) : null;
}

const AGE_ORDER = { under13: 0, teen: 1, adult: 2 } as const;
export function meetsAgeRequirement(player: keyof typeof AGE_ORDER, required: keyof typeof AGE_ORDER) {
  return AGE_ORDER[player] >= AGE_ORDER[required];
}
