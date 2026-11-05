import { parseZoneDefinition, type ZoneDefinition } from "@happyroom/world";

export interface ZoneSummary {
  zoneId: string;
  displayName: Record<string, string>;
  maxPlayers: number;
  version: string;
  worldId: string;
  isDefault: boolean;
}

/**
 * ZoneRegistry (client) — published zones come from the server registry (database rows written by
 * `pnpm world:sync`), are validated with the shared schema, and cached per zoneId@version.
 */
export class ZoneRegistry {
  private defs = new Map<string, ZoneDefinition>();
  private list: Promise<ZoneSummary[]> | null = null;

  async zones(): Promise<ZoneSummary[]> {
    this.list ??= fetch("/api/world/zones", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`zones ${r.status}`))))
      .then((b: { zones: ZoneSummary[] }) => b.zones)
      .catch((e) => {
        this.list = null;
        throw e;
      });
    return this.list;
  }

  /** Cache a definition received from the matchmaker (avoids a second request). */
  remember(def: unknown): ZoneDefinition {
    const zone = parseZoneDefinition(def);
    this.defs.set(zone.zoneId, zone);
    return zone;
  }

  async get(zoneId: string): Promise<ZoneDefinition> {
    const cached = this.defs.get(zoneId);
    if (cached) return cached;
    const r = await fetch(`/api/world/zones/${encodeURIComponent(zoneId)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`zone_not_found:${zoneId}`);
    return this.remember((await r.json()).zone);
  }
}
