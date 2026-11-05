import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { analyzeRoomAsset, classifyNodeName, interactableIdFor, setFlamesVisible } from "./room-asset";

function box(
  name: string,
  size: [number, number, number],
  pos: [number, number, number],
  parent?: THREE.Object3D,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size));
  m.name = name;
  m.position.set(...pos);
  (parent ?? scene).add(m);
  return m;
}
let scene: THREE.Group;

describe("classifyNodeName", () => {
  it.each([
    ["Cake_Main", "cake"],
    ["Candle.003", "candle"],
    ["Candle_Flame_01", "flame"],
    ["Gift_Box_Red", "gift"],
    ["Wall_Back", "wall"],
    ["Floor_Wood", "floor"],
    ["Table_Gift", "furniture"],
    ["Balloon_Cluster_A", "decoration"],
    ["COL_CakeTable", "collider"],
    ["SPAWN_01", "spawn"],
    ["INT_PhotoBooth", "interactable"],
  ])("%s → %s", (name, role) => {
    expect(classifyNodeName(name)).toBe(role);
  });

  it("returns null for unknown names", () => {
    expect(classifyNodeName("Mesh.017")).toBeNull();
  });

  it("maps interactables", () => {
    expect(interactableIdFor("INT_Gift_Table")).toBe("gift_table");
    expect(interactableIdFor("INT_MemoryWall")).toBe("memory_wall");
    expect(interactableIdFor("INT_Door")).toBe("door");
  });
});

describe("analyzeRoomAsset", () => {
  it("extracts colliders, spawns, interactables and bounds while preserving names", () => {
    scene = new THREE.Group();
    box("Floor_Main", [14, 0.1, 12], [0, -0.05, 0]);
    box("Wall_Back", [14, 3.6, 0.2], [0, 1.8, -6]);
    const cake = box("Cake_Main", [1, 0.6, 1], [0, 1, 0]);
    box("Candle_01", [0.05, 0.2, 0.05], [0.1, 1.4, 0], cake);
    box("Candle_Flame_01", [0.03, 0.05, 0.03], [0.1, 1.55, 0], cake);
    box("COL_CakeTable", [2, 1, 2], [0, 0.5, 0]);
    box("INT_PhotoBooth", [2, 2, 2], [5.7, 1, -2.8]);
    const spawn = new THREE.Object3D();
    spawn.name = "SPAWN_01";
    spawn.position.set(0, 0, 4.8);
    scene.add(spawn);
    box("Mesh.017", [1, 1, 1], [3, 0, 3]);

    const a = analyzeRoomAsset(scene);
    expect(a.byRole.cake).toEqual(["Cake_Main"]);
    expect(a.byRole.candle).toEqual(["Candle_01"]);
    expect(a.byRole.flame).toEqual(["Candle_Flame_01"]);
    expect(a.colliders).toEqual([{ id: "COL_CakeTable", minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]);
    expect(a.spawnPoints).toEqual([{ x: 0, z: 4.8 }]);
    expect(a.interactables.cake).toEqual({ x: 0, z: 0 });
    expect(a.interactables.photo_booth?.x).toBeCloseTo(5.7);
    expect(a.bounds).toEqual({ minX: -7, maxX: 7, minZ: -6, maxZ: 6 });
    expect(a.unclassified).toEqual(["Mesh.017"]);
  });

  it("toggles candle flames without renaming nodes", () => {
    scene = new THREE.Group();
    const f = box("Candle_Flame_01", [0.1, 0.1, 0.1], [0, 0, 0]);
    setFlamesVisible(scene, false);
    expect(f.visible).toBe(false);
    expect(f.name).toBe("Candle_Flame_01");
  });
});
