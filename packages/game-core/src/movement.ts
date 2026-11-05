import type { BirthdayRoomLayout, FloorRect, Vec2 } from "@happyroom/shared";

/**
 * Server-side movement validation. Clients send their predicted position; the server:
 *  1. rejects non-finite input (done by the protocol schema),
 *  2. limits displacement to maxSpeed × elapsed × tolerance (no teleporting / speed hacks),
 *  3. clamps to room bounds and pushes out of furniture,
 *  4. reports whether the client must be corrected (reconciliation).
 */

export interface MoveSample extends Vec2 {
  /** Server receive time (ms) of the last accepted sample. */
  t: number;
}

export interface MoveResult extends Vec2 {
  /** True if the accepted position differs from what the client asked for. */
  corrected: boolean;
  reason: "ok" | "speed" | "bounds" | "collision" | null;
}

export interface MovementConfig {
  /** Multiplier over maxSpeed to absorb network jitter. */
  speedTolerance: number;
  /** Max elapsed time credited per sample, so a long pause can't bank a teleport. */
  maxCreditedMs: number;
  /** Corrections smaller than this (m) are not reported back to the client. */
  correctionEpsilon: number;
}

export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  speedTolerance: 1.35,
  maxCreditedMs: 500,
  correctionEpsilon: 0.05,
};

export function clampToBounds(p: Vec2, layout: BirthdayRoomLayout): Vec2 {
  const r = layout.avatarRadius;
  const b = layout.bounds;
  return {
    x: Math.min(b.maxX - r, Math.max(b.minX + r, p.x)),
    z: Math.min(b.maxZ - r, Math.max(b.minZ + r, p.z)),
  };
}

/** Push a circle of radius r out of an axis-aligned rectangle along the shortest axis. */
export function pushOutOfRect(p: Vec2, rect: FloorRect, r: number): Vec2 | null {
  const minX = rect.minX - r;
  const maxX = rect.maxX + r;
  const minZ = rect.minZ - r;
  const maxZ = rect.maxZ + r;
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

export function resolveCollisions(p: Vec2, layout: BirthdayRoomLayout): { pos: Vec2; collided: boolean } {
  let pos = p;
  let collided = false;
  // Two passes handle the corner case of being pushed from one obstacle into another.
  for (let pass = 0; pass < 2; pass++) {
    for (const rect of layout.obstacles) {
      const pushed = pushOutOfRect(pos, rect, layout.avatarRadius);
      if (pushed) {
        pos = pushed;
        collided = true;
      }
    }
    pos = clampToBounds(pos, layout);
  }
  return { pos, collided };
}

export function validateMove(
  prev: MoveSample,
  requested: Vec2,
  now: number,
  layout: BirthdayRoomLayout,
  config: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
): MoveResult {
  const elapsed = Math.min(Math.max(now - prev.t, 0), config.maxCreditedMs);
  const maxDist = layout.maxSpeed * config.speedTolerance * (elapsed / 1000);
  const dx = requested.x - prev.x;
  const dz = requested.z - prev.z;
  const dist = Math.hypot(dx, dz);

  let candidate: Vec2 = requested;
  let reason: MoveResult["reason"] = "ok";
  if (dist > maxDist) {
    const s = dist === 0 ? 0 : maxDist / dist;
    candidate = { x: prev.x + dx * s, z: prev.z + dz * s };
    reason = "speed";
  }

  const bounded = clampToBounds(candidate, layout);
  if (reason === "ok" && (bounded.x !== candidate.x || bounded.z !== candidate.z)) reason = "bounds";

  const { pos, collided } = resolveCollisions(bounded, layout);
  if (reason === "ok" && collided) reason = "collision";

  const error = Math.hypot(pos.x - requested.x, pos.z - requested.z);
  const corrected = error > config.correctionEpsilon;
  return { x: pos.x, z: pos.z, corrected, reason: corrected ? reason : null };
}

/** Pick the least crowded spawn point so arriving avatars do not stack. */
export function chooseSpawnPoint(layout: BirthdayRoomLayout, occupied: readonly Vec2[]): Vec2 {
  let best: Vec2 = layout.spawnPoints[0] ?? { x: 0, z: 0 };
  let bestScore = -Infinity;
  for (const sp of layout.spawnPoints) {
    let nearest = Infinity;
    for (const o of occupied) nearest = Math.min(nearest, Math.hypot(o.x - sp.x, o.z - sp.z));
    if (nearest > bestScore) {
      bestScore = nearest;
      best = sp;
    }
  }
  return { x: best.x, z: best.z };
}

/** Normalise any angle to (-π, π]. */
export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  if (r > Math.PI) r -= twoPi;
  return r;
}
