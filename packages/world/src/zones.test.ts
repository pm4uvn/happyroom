import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AVATAR_RADIUS,
  buildZoneCollision,
  isWalkable,
  parseZoneDefinition,
  reachable,
  resolveCollisions,
  RUN_SPEED,
  safeSpawn,
  SPEED_TOLERANCE,
  validateZoneMove,
  zoneDefinitionSchema,
} from "./index.js";

const dir = fileURLToPath(new URL("../zones/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".zone.json"));
const zones = files.map((f) => parseZoneDefinition(JSON.parse(readFileSync(dir + f, "utf8"))));

describe("zone data files", () => {
  it("includes the Central Plaza and at least one more zone", () => {
    expect(zones.map((z) => z.zoneId).sort()).toEqual(
      expect.arrayContaining(["central_plaza", "garden_terrace"]),
    );
  });

  it.each(files)("%s is valid and its filename matches its zoneId", (f) => {
    const z = parseZoneDefinition(JSON.parse(readFileSync(dir + f, "utf8")));
    expect(f).toBe(`${z.zoneId}.zone.json`);
  });

  it("Central Plaza is 40 m × 40 m with the required features", () => {
    const p = zones.find((z) => z.zoneId === "central_plaza")!;
    expect(p.bounds).toEqual({ minX: -20, maxX: 20, minZ: -20, maxZ: 20 });
    const types = new Set(p.objects.map((o) => o.type));
    for (const t of ["tree", "bench", "flowerbed", "street_lamp", "fountain", "signpost", "birthday_house"])
      expect(types).toContain(t);
    expect(p.terrain.map((t) => t.material)).toEqual(
      expect.arrayContaining(["grass", "path", "plaza_stone"]),
    );
    expect(p.expansionAreas.length).toBeGreaterThan(0);
    expect(p.portals.find((x) => x.target.kind === "birthday_house")).toBeTruthy();
  });

  it("portal targets exist in the registry", () => {
    const byId = new Map(zones.map((z) => [z.zoneId, z]));
    for (const z of zones)
      for (const p of z.portals) {
        if (p.target.kind !== "zone") continue;
        const target = byId.get(p.target.zoneId);
        expect(target, `${z.zoneId}.${p.id}`).toBeTruthy();
        const spawnId = p.target.spawnId;
        expect(target!.spawnPoints.some((s) => s.id === spawnId)).toBe(true);
      }
  });

  it.each(zones.map((z) => [z.zoneId, z] as const))(
    "%s: every spawn point is walkable and every spawn/portal is reachable on foot",
    (_id, z) => {
      const zc = buildZoneCollision(z);
      for (const s of z.spawnPoints) expect(isWalkable(s, zc), s.id).toBe(true);
      const start = z.spawnPoints.find((s) => s.default)!;
      const targets = [...z.spawnPoints, ...z.portals.map((p) => ({ x: p.position[0], z: p.position[1] }))];
      expect(reachable(zc, start, targets)).toEqual(targets.map(() => true));
    },
  );

  it("rejects invalid definitions (duplicate ids, missing default spawn)", () => {
    const p = JSON.parse(readFileSync(dir + "central_plaza.zone.json", "utf8"));
    p.objects.push({ ...p.objects[0] });
    expect(zoneDefinitionSchema.safeParse(p).success).toBe(false);
    const q = JSON.parse(readFileSync(dir + "central_plaza.zone.json", "utf8"));
    q.spawnPoints = q.spawnPoints.map((s: object) => ({ ...s, default: false }));
    expect(zoneDefinitionSchema.safeParse(q).success).toBe(false);
  });
});

describe("collision system", () => {
  const plaza = zones.find((z) => z.zoneId === "central_plaza")!;
  const zc = buildZoneCollision(plaza);

  it("blocks walking into the fountain and the Birthday House", () => {
    expect(isWalkable({ x: 0, z: 1 }, zc)).toBe(false);
    expect(isWalkable({ x: 0, z: -15 }, zc)).toBe(false);
    const r = resolveCollisions({ x: 0, z: 2.5 }, zc);
    expect(Math.hypot(r.pos.x, r.pos.z)).toBeCloseTo(2.6 + AVATAR_RADIUS, 5);
  });

  it("keeps players inside the 40 m bounds", () => {
    const r = resolveCollisions({ x: 25, z: 0 }, zc);
    expect(r.pos.x).toBeCloseTo(20 - AVATAR_RADIUS);
  });

  it("caps movement at run speed × tolerance and never credits more than 500 ms", () => {
    const r = validateZoneMove({ x: 0, z: 12, t: 0 }, { x: 0, z: 2 }, 100_000, zc);
    expect(12 - r.z).toBeCloseTo(RUN_SPEED * SPEED_TOLERANCE * 0.5, 5);
    expect(r.corrected).toBe(true);
  });

  it("moves a blocked spawn to the nearest walkable point", () => {
    const p = safeSpawn({ x: 0, z: 0 }, zc, { x: 0, z: 12 });
    expect(isWalkable(p, zc)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(4);
  });
});
