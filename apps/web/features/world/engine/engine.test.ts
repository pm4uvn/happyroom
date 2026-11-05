// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildZoneCollision, parseZoneDefinition, RUN_SPEED, WALK_SPEED } from "@happyroom/world";
import { stepCharacter, type Pose } from "./character-controller";
import { WorldEventBus } from "./event-bus";
import { findFocus } from "./interaction";

const plaza = parseZoneDefinition(
  JSON.parse(
    readFileSync(
      new URL("../../../../../packages/world/zones/central_plaza.zone.json", import.meta.url),
      "utf8",
    ),
  ),
);
const zc = buildZoneCollision(plaza);
const start: Pose = { x: 0, z: 12, rotY: Math.PI, anim: "idle" };

describe("CharacterController", () => {
  it("walks camera-relative: forward with the camera looking −Z moves towards −Z", () => {
    const p = stepCharacter(start, { x: 0, y: 1, sprint: false }, Math.PI, 0.5, zc);
    expect(p.z).toBeCloseTo(12 - WALK_SPEED * 0.5, 5);
    expect(p.anim).toBe("walk");
  });

  it("sprints at run speed", () => {
    const p = stepCharacter(start, { x: 0, y: 1, sprint: true }, Math.PI, 0.5, zc);
    expect(12 - p.z).toBeCloseTo(RUN_SPEED * 0.5, 5);
    expect(p.anim).toBe("run");
  });

  it("strafes right relative to the camera", () => {
    const p = stepCharacter(start, { x: 1, y: 0, sprint: false }, Math.PI, 0.2, zc);
    // Camera looks −Z (like Three's default camera), so screen-right is world +X.
    expect(p.x).toBeGreaterThan(0);
    expect(p.z).toBeCloseTo(12, 5);
  });

  it("idles without input and never walks through the fountain", () => {
    expect(stepCharacter(start, { x: 0, y: 0, sprint: false }, 0, 0.1, zc).anim).toBe("idle");
    let p = start;
    for (let i = 0; i < 100; i++) p = stepCharacter(p, { x: 0, y: 1, sprint: true }, Math.PI, 0.05, zc);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(2.6);
  });
});

describe("interaction + portal systems", () => {
  it("focuses the Birthday House door portal when standing in front of it", () => {
    const f = findFocus(plaza, 0, -10.5);
    expect(f).toMatchObject({ kind: "portal", id: "birthday_house_door" });
  });
  it("focuses the fountain message near the fountain, nothing in an empty corner", () => {
    expect(findFocus(plaza, 0, 3.4)).toMatchObject({ kind: "message", id: "fountain_main" });
    expect(findFocus(plaza, -19, 19)).toBeNull();
  });
});

describe("WorldEventBus", () => {
  it("delivers typed events and unsubscribes", () => {
    const bus = new WorldEventBus();
    const seen: string[] = [];
    const off = bus.on("zone:ready", (e) => seen.push(e.zoneId));
    bus.emit("zone:ready", { zoneId: "central_plaza" });
    off();
    bus.emit("zone:ready", { zoneId: "garden_terrace" });
    expect(seen).toEqual(["central_plaza"]);
  });
});
