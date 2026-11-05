import type { Rect, ZoneDefinition } from "./zone-schema.js";

/**
 * CollisionSystem — shared by client prediction and server authority, so both agree exactly.
 * Floor-plane only (2D): circles and axis-aligned boxes derived from zone data.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type Collider =
  | { id: string; kind: "circle"; x: number; z: number; r: number }
  | { id: string; kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number };

export interface ZoneCollision {
  bounds: Rect;
  colliders: Collider[];
}

export const AVATAR_RADIUS = 0.35;
export const WALK_SPEED = 3.0;
export const RUN_SPEED = 5.4;
/** Server tolerance over the run speed to absorb jitter. */
export const SPEED_TOLERANCE = 1.3;

/** Build the collision set from a zone definition (objects with colliders + non-walkable terrain). */
export function buildZoneCollision(zone: ZoneDefinition): ZoneCollision {
  const colliders: Collider[] = [];
  for (const o of zone.objects) {
    if (!o.collider) continue;
    const [x, , z] = o.position;
    const s = o.scale;
    if (o.collider.kind === "circle") {
      colliders.push({ id: o.id, kind: "circle", x, z, r: o.collider.radius * s });
    } else {
      const quarter = Math.round((((o.rotationY % 360) + 360) % 360) / 90) % 2 === 1;
      const w = (quarter ? o.collider.depth : o.collider.width) * s;
      const d = (quarter ? o.collider.width : o.collider.depth) * s;
      colliders.push({
        id: o.id,
        kind: "box",
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    }
  }
  for (const t of zone.terrain) {
    if (t.walkable) continue;
    if (t.shape.kind === "circle") {
      colliders.push({
        id: t.id,
        kind: "circle",
        x: t.shape.center[0],
        z: t.shape.center[1],
        r: t.shape.radius,
      });
    } else {
      colliders.push({ id: t.id, kind: "box", ...t.shape.rect });
    }
  }
  return { bounds: zone.bounds, colliders };
}

export function clampToBounds(p: Vec2, bounds: Rect, r = AVATAR_RADIUS): Vec2 {
  return {
    x: Math.min(bounds.maxX - r, Math.max(bounds.minX + r, p.x)),
    z: Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, p.z)),
  };
}

/** Push a circle (player) out of one collider; returns null if not overlapping. */
export function pushOut(p: Vec2, c: Collider, r = AVATAR_RADIUS): Vec2 | null {
  if (c.kind === "circle") {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const min = c.r + r;
    const d = Math.hypot(dx, dz);
    if (d >= min) return null;
    if (d < 1e-6) return { x: c.x + min, z: c.z };
    return { x: c.x + (dx / d) * min, z: c.z + (dz / d) * min };
  }
  const minX = c.minX - r;
  const maxX = c.maxX + r;
  const minZ = c.minZ - r;
  const maxZ = c.maxZ + r;
  if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) return null;
  const dl = p.x - minX;
  const dr = maxX - p.x;
  const dt = p.z - minZ;
  const db = maxZ - p.z;
  const m = Math.min(dl, dr, dt, db);
  if (m === dl) return { x: minX, z: p.z };
  if (m === dr) return { x: maxX, z: p.z };
  if (m === dt) return { x: p.x, z: minZ };
  return { x: p.x, z: maxZ };
}

export function resolveCollisions(
  p: Vec2,
  zc: ZoneCollision,
  r = AVATAR_RADIUS,
): { pos: Vec2; collided: boolean } {
  let pos = clampToBounds(p, zc.bounds, r);
  let collided = pos.x !== p.x || pos.z !== p.z;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of zc.colliders) {
      const out = pushOut(pos, c, r);
      if (out) {
        pos = clampToBounds(out, zc.bounds, r);
        moved = collided = true;
      }
    }
    if (!moved) break;
  }
  return { pos, collided };
}

export function isWalkable(p: Vec2, zc: ZoneCollision, r = AVATAR_RADIUS): boolean {
  const b = zc.bounds;
  if (p.x < b.minX + r || p.x > b.maxX - r || p.z < b.minZ + r || p.z > b.maxZ - r) return false;
  return zc.colliders.every((c) => pushOut(p, c, r) === null);
}

export interface MoveSample extends Vec2 {
  t: number;
}

/**
 * Server-side validation of a client-predicted position: speed cap (run speed × tolerance, max
 * 500 ms credited), bounds and collisions. Returns the accepted position.
 */
export function validateZoneMove(
  prev: MoveSample,
  requested: Vec2,
  now: number,
  zc: ZoneCollision,
): Vec2 & { corrected: boolean } {
  const elapsed = Math.min(Math.max(now - prev.t, 0), 500);
  const maxDist = RUN_SPEED * SPEED_TOLERANCE * (elapsed / 1000);
  const dx = requested.x - prev.x;
  const dz = requested.z - prev.z;
  const dist = Math.hypot(dx, dz);
  const s = dist > maxDist && dist > 0 ? maxDist / dist : 1;
  const candidate = { x: prev.x + dx * s, z: prev.z + dz * s };
  const { pos } = resolveCollisions(candidate, zc);
  const corrected = Math.hypot(pos.x - requested.x, pos.z - requested.z) > 0.05;
  return { ...pos, corrected };
}

/**
 * Safe spawn: the requested point if walkable, otherwise the nearest walkable point on rings
 * around it, otherwise the zone's default spawn.
 */
export function safeSpawn(preferred: Vec2, zc: ZoneCollision, fallback: Vec2): Vec2 {
  if (isWalkable(preferred, zc)) return preferred;
  for (let ring = 1; ring <= 12; ring++) {
    const r = ring * 0.5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = { x: preferred.x + Math.cos(a) * r, z: preferred.z + Math.sin(a) * r };
      if (isWalkable(p, zc)) return p;
    }
  }
  return fallback;
}

/**
 * Reachability check on a 0.25 m grid (flood fill from `from`). Used by tests and the sync script
 * to guarantee every spawn point and portal is reachable on foot.
 */
export function reachable(zc: ZoneCollision, from: Vec2, targets: Vec2[], cell = 0.25): boolean[] {
  const b = zc.bounds;
  const cols = Math.ceil((b.maxX - b.minX) / cell);
  const rows = Math.ceil((b.maxZ - b.minZ) / cell);
  const idx = (cx: number, cz: number) => cz * cols + cx;
  const toCell = (p: Vec2) => [Math.floor((p.x - b.minX) / cell), Math.floor((p.z - b.minZ) / cell)] as const;
  const center = (cx: number, cz: number) => ({
    x: b.minX + (cx + 0.5) * cell,
    z: b.minZ + (cz + 0.5) * cell,
  });
  const seen = new Uint8Array(cols * rows);
  const queue: number[] = [];
  const [sx, sz] = toCell(from);
  if (!isWalkable(center(sx, sz), zc)) return targets.map(() => false);
  seen[idx(sx, sz)] = 1;
  queue.push(idx(sx, sz));
  while (queue.length) {
    const i = queue.pop()!;
    const cx = i % cols;
    const cz = (i - cx) / cols;
    for (const [nx, nz] of [
      [cx + 1, cz],
      [cx - 1, cz],
      [cx, cz + 1],
      [cx, cz - 1],
    ] as const) {
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows || seen[idx(nx, nz)]) continue;
      if (!isWalkable(center(nx, nz), zc)) continue;
      seen[idx(nx, nz)] = 1;
      queue.push(idx(nx, nz));
    }
  }
  return targets.map((t) => {
    const [tx, tz] = toCell(t);
    // A target counts as reachable if any walkable cell within 1 m of it was visited.
    const reach = Math.ceil(1 / cell);
    for (let dz = -reach; dz <= reach; dz++)
      for (let dx = -reach; dx <= reach; dx++) {
        const x = tx + dx;
        const z = tz + dz;
        if (x >= 0 && z >= 0 && x < cols && z < rows && seen[idx(x, z)]) return true;
      }
    return false;
  });
}

export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  if (r > Math.PI) r -= twoPi;
  return r;
}
