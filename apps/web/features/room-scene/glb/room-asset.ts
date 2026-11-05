import * as THREE from "three";
import type { FloorRect, Vec2 } from "@happyroom/shared";

/**
 * Blender room asset integration (HappyRoom_BirthdayStudio_V2.glb).
 *
 * The GLB is used as-is: its geometry, materials and *node names are preserved*. This module only
 * classifies nodes by name so gameplay can find the cake, candles, gifts, walls, furniture,
 * interactables, collision volumes and spawn points. See docs/ASSETS_GLB.md for the naming contract
 * and import steps.
 */
export const ROOM_ASSET_FILE = "HappyRoom_BirthdayStudio_V2.glb";
export const ROOM_ASSET_URL = `/assets/rooms/${ROOM_ASSET_FILE}`;

/**
 * Placement of the GLB in game space (metres, Y-up). glTF exporters convert Blender's Z-up to Y-up,
 * so only scale/offset/rotation need adjusting if the model was not authored at the origin.
 */
export const ROOM_ASSET_TRANSFORM = {
  scale: 1,
  position: [0, 0, 0] as [number, number, number],
  rotationY: 0,
};

export type NodeRole =
  | "cake"
  | "candle"
  | "flame"
  | "gift"
  | "wall"
  | "floor"
  | "furniture"
  | "decoration"
  | "interactable"
  | "collider"
  | "spawn";

export type InteractableId = "cake" | "gift_table" | "memory_wall" | "photo_booth" | "door";

/** Name patterns, checked in order. Explicit prefixes (COL_, SPAWN_, INT_) win over keywords. */
const RULES: { role: NodeRole; test: RegExp }[] = [
  { role: "collider", test: /^(COL|COLLIDER|UCX)[_-]/i },
  { role: "spawn", test: /^(SPAWN|SP)[_-]/i },
  { role: "interactable", test: /^INT[_-]/i },
  { role: "flame", test: /flame|fire/i },
  { role: "candle", test: /candle/i },
  { role: "cake", test: /cake/i },
  { role: "furniture", test: /table|chair|sofa|couch|shelf|cabinet|bench|stool|desk|booth/i },
  { role: "gift", test: /gift|present/i },
  { role: "floor", test: /floor|ground|rug|carpet/i },
  { role: "wall", test: /wall|ceiling|window|baseboard/i },
  { role: "decoration", test: /balloon|banner|bunting|garland|light|lamp|flower|plant|frame|photo/i },
];

const INTERACTABLE_RULES: { id: InteractableId; test: RegExp }[] = [
  { id: "cake", test: /cake/i },
  { id: "gift_table", test: /gift.?table|present.?table/i },
  { id: "memory_wall", test: /memory|wish.?wall|board/i },
  { id: "photo_booth", test: /photo|booth|camera/i },
  { id: "door", test: /door|entrance/i },
];

export function classifyNodeName(name: string): NodeRole | null {
  for (const r of RULES) if (r.test.test(name)) return r.role;
  return null;
}

export function interactableIdFor(name: string): InteractableId | null {
  const stripped = name.replace(/^INT[_-]/i, "");
  for (const r of INTERACTABLE_RULES) if (r.test.test(stripped)) return r.id;
  return null;
}

export interface RoomAssetAnalysis {
  /** Original Blender/glTF node names grouped by role (names are preserved, never renamed). */
  byRole: Record<NodeRole, string[]>;
  /** World-space floor footprints of COL_* volumes (or furniture when no colliders exist). */
  colliders: FloorRect[];
  spawnPoints: Vec2[];
  interactables: Partial<Record<InteractableId, Vec2>>;
  /** Overall floor bounds derived from floor meshes (or the whole model). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  unclassified: string[];
}

/** Walk a loaded glTF scene and extract gameplay data. Pure: does not modify the scene. */
export function analyzeRoomAsset(root: THREE.Object3D): RoomAssetAnalysis {
  root.updateWorldMatrix(true, true);
  const byRole = {
    cake: [],
    candle: [],
    flame: [],
    gift: [],
    wall: [],
    floor: [],
    furniture: [],
    decoration: [],
    interactable: [],
    collider: [],
    spawn: [],
  } as Record<NodeRole, string[]>;
  const colliders: FloorRect[] = [];
  const furnitureRects: FloorRect[] = [];
  const spawnPoints: Vec2[] = [];
  const interactables: Partial<Record<InteractableId, Vec2>> = {};
  const unclassified: string[] = [];
  const floorBox = new THREE.Box3();
  const box = new THREE.Box3();
  const p = new THREE.Vector3();

  root.traverse((obj) => {
    if (obj === root || !obj.name) return;
    const role = classifyNodeName(obj.name);
    if (!role) {
      if ((obj as THREE.Mesh).isMesh) unclassified.push(obj.name);
      return;
    }
    // Only record the top-most classified node of a hierarchy for each role.
    if (obj.parent && obj.parent !== root && classifyNodeName(obj.parent.name) === role) return;
    byRole[role].push(obj.name);

    box.setFromObject(obj);
    const rect = (id: string): FloorRect => ({
      id,
      minX: box.min.x,
      maxX: box.max.x,
      minZ: box.min.z,
      maxZ: box.max.z,
    });
    obj.getWorldPosition(p);

    if (role === "collider") colliders.push(rect(obj.name));
    else if (role === "furniture" && !box.isEmpty()) furnitureRects.push(rect(obj.name));
    else if (role === "spawn") spawnPoints.push({ x: p.x, z: p.z });
    else if (role === "floor" && !box.isEmpty()) floorBox.union(box);

    const iid = role === "interactable" || role === "cake" ? interactableIdFor(obj.name) : null;
    if (iid && !interactables[iid]) {
      const c = box.isEmpty() ? p : box.getCenter(new THREE.Vector3());
      interactables[iid] = { x: c.x, z: c.z };
    }
  });

  if (floorBox.isEmpty()) floorBox.setFromObject(root);
  return {
    byRole,
    colliders: colliders.length ? colliders : furnitureRects,
    spawnPoints,
    interactables,
    bounds: { minX: floorBox.min.x, maxX: floorBox.max.x, minZ: floorBox.min.z, maxZ: floorBox.max.z },
    unclassified,
  };
}

/** Turn candle flames on/off by toggling the visibility of flame nodes (names untouched). */
export function setFlamesVisible(root: THREE.Object3D, visible: boolean) {
  root.traverse((o) => {
    if (classifyNodeName(o.name) === "flame") o.visible = visible;
  });
}

let availability: Promise<boolean> | null = null;
/** Whether the GLB has been added to apps/web/public/assets/rooms (checked once per page load). */
export function roomAssetAvailable(): Promise<boolean> {
  availability ??= fetch(ROOM_ASSET_URL, { method: "HEAD" })
    .then((r) => r.ok)
    .catch(() => false);
  return availability;
}
