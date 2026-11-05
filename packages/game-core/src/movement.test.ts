import { describe, expect, it } from "vitest";
import { BIRTHDAY_ROOM as L } from "@happyroom/shared";
import { chooseSpawnPoint, normalizeAngle, validateMove } from "./movement.js";

describe("validateMove", () => {
  const start = { x: 0, z: 4, t: 1000 };

  it("accepts a plausible step", () => {
    expect(validateMove(start, { x: 0.3, z: 4 }, 1100, L)).toMatchObject({ x: 0.3, z: 4, corrected: false });
  });

  it("clamps speed-hack teleports to the max distance", () => {
    const r = validateMove(start, { x: 6, z: 4 }, 1100, L);
    expect(r.corrected).toBe(true);
    expect(r.reason).toBe("speed");
    expect(r.x).toBeCloseTo(L.maxSpeed * 1.35 * 0.1, 5);
  });

  it("does not bank time across a long pause", () => {
    const r = validateMove(start, { x: 6, z: 4 }, 60_000, L);
    expect(r.x).toBeCloseTo(L.maxSpeed * 1.35 * 0.5, 5);
  });

  it("keeps avatars inside the walls", () => {
    const r = validateMove({ x: 6.6, z: 0, t: 0 }, { x: 7.5, z: 0 }, 400, L);
    expect(r.x).toBeLessThanOrEqual(L.bounds.maxX - L.avatarRadius);
    expect(r.corrected).toBe(true);
  });

  it("pushes avatars out of the cake table", () => {
    const r = validateMove({ x: 0, z: 1.5, t: 0 }, { x: 0, z: 1.2 }, 200, L);
    expect(r.z).toBeCloseTo(1.0 + L.avatarRadius, 5);
    expect(r.reason).toBe("collision");
  });
});

describe("chooseSpawnPoint", () => {
  it("picks the first spawn in an empty room", () => {
    expect(chooseSpawnPoint(L, [])).toEqual(L.spawnPoints[0]);
  });
  it("avoids occupied spawn points", () => {
    expect(chooseSpawnPoint(L, [{ x: 0, z: 4.8 }])).not.toEqual({ x: 0, z: 4.8 });
  });
  it("never spawns inside an obstacle", () => {
    for (const sp of L.spawnPoints) {
      for (const o of L.obstacles) {
        const inside = sp.x > o.minX && sp.x < o.maxX && sp.z > o.minZ && sp.z < o.maxZ;
        expect(inside).toBe(false);
      }
    }
  });
});

describe("normalizeAngle", () => {
  it("wraps into (-π, π]", () => {
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
  });
});
