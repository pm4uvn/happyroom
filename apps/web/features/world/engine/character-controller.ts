import { resolveCollisions, RUN_SPEED, WALK_SPEED, type ZoneCollision } from "@happyroom/world";

/**
 * CharacterController — camera-relative movement with sprint, shared collision, and smooth facing.
 * Pure function so it is unit-testable and identical regardless of renderer.
 */
export interface Pose {
  x: number;
  z: number;
  rotY: number;
  anim: "idle" | "walk" | "run";
}

export interface ControlInput {
  /** Screen-space stick: x = right, y = forward (away from camera). |v| ≤ 1. */
  x: number;
  y: number;
  sprint: boolean;
}

/**
 * @param cameraYaw yaw of the camera's forward vector on the floor plane (radians, atan2(fx, fz)).
 */
export function stepCharacter(
  pose: Pose,
  input: ControlInput,
  cameraYaw: number,
  dt: number,
  zc: ZoneCollision,
): Pose {
  const mag = Math.min(1, Math.hypot(input.x, input.y));
  if (mag < 0.05) return { ...pose, anim: "idle" };
  const fwdX = Math.sin(cameraYaw);
  const fwdZ = Math.cos(cameraYaw);
  // Right vector = forward × up (camera looking −Z → right is +X).
  const rightX = -fwdZ;
  const rightZ = fwdX;
  const dirX = (fwdX * input.y + rightX * input.x) / mag;
  const dirZ = (fwdZ * input.y + rightZ * input.x) / mag;
  const running = input.sprint && mag > 0.5;
  const speed = (running ? RUN_SPEED : WALK_SPEED) * mag;
  const next = resolveCollisions({ x: pose.x + dirX * speed * dt, z: pose.z + dirZ * speed * dt }, zc).pos;
  const targetYaw = Math.atan2(dirX, dirZ);
  // Smooth turn (critically damped-ish), shortest way around.
  let diff = targetYaw - pose.rotY;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const rotY = pose.rotY + diff * Math.min(1, dt * 12);
  return { x: next.x, z: next.z, rotY, anim: running ? "run" : "walk" };
}
