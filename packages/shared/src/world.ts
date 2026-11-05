/**
 * Birthday room layout — the single source of truth for both the client scene and
 * the server's authoritative movement/collision checks. Units: metres, Y-up,
 * floor at y = 0, room centred on the origin, door on the +Z wall.
 */

export interface Vec2 {
  x: number;
  z: number;
}

/** Axis-aligned rectangle on the floor plane used for collision. */
export interface FloorRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Interactable {
  id: "cake" | "gift_table" | "memory_wall" | "photo_booth" | "door";
  position: Vec2;
  /** Distance within which the player can use the context action. */
  radius: number;
}

export const BIRTHDAY_ROOM = {
  /** Walkable floor bounds (inner side of walls, minus avatar radius margin applied at runtime). */
  bounds: { minX: -7, maxX: 7, minZ: -6, maxZ: 6 },
  avatarRadius: 0.35,
  wallHeight: 3.6,
  /** Max horizontal walking speed (m/s). Server tolerance is applied on top. */
  maxSpeed: 3.2,
  spawnPoints: [
    { x: 0, z: 4.8 },
    { x: -1.2, z: 4.6 },
    { x: 1.2, z: 4.6 },
    { x: -2.4, z: 4.3 },
    { x: 2.4, z: 4.3 },
    { x: -0.6, z: 3.8 },
    { x: 0.6, z: 3.8 },
    { x: -1.8, z: 3.5 },
    { x: 1.8, z: 3.5 },
    { x: 0, z: 3.2 },
  ] satisfies Vec2[],
  /** Solid furniture footprints. */
  obstacles: [
    { id: "cake_table", minX: -1.0, maxX: 1.0, minZ: -1.0, maxZ: 1.0 },
    { id: "gift_table", minX: -6.6, maxX: -4.4, minZ: -2.2, maxZ: -0.8 },
    { id: "memory_wall", minX: -3.0, maxX: 3.0, minZ: -6.0, maxZ: -5.6 },
    { id: "photo_booth", minX: 4.6, maxX: 6.8, minZ: -3.8, maxZ: -1.8 },
  ] satisfies FloorRect[],
  interactables: [
    { id: "cake", position: { x: 0, z: 0 }, radius: 2.0 },
    { id: "gift_table", position: { x: -5.5, z: -1.5 }, radius: 1.9 },
    { id: "memory_wall", position: { x: 0, z: -5.6 }, radius: 2.2 },
    { id: "photo_booth", position: { x: 5.7, z: -2.8 }, radius: 1.9 },
    { id: "door", position: { x: 0, z: 6 }, radius: 1.6 },
  ] satisfies Interactable[],
  /** Where the camera focuses during the ceremony. */
  ceremonyFocus: { x: 0, y: 1.1, z: 0 },
} as const;

export type BirthdayRoomLayout = typeof BIRTHDAY_ROOM;
