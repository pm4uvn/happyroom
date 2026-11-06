import * as THREE from "three";
import { latLngToXYZ } from "./geo";

/** A point on the globe is only considered visible/interactive while it faces the camera. */
export const FACING_LIMIT = 0.12;

export interface ScreenPoint {
  x: number;
  y: number;
  /** Raw camera-alignment dot product: 1 = dead centre of the visible face, ~FACING_LIMIT = at the limb. */
  facing: number;
}

/**
 * Projects a lat/lng point on the globe (radius ≈ 1) to CSS pixel coordinates within the R3F
 * canvas, or `null` when the point faces away from the camera (back of the sphere) — shared by
 * markers and country labels so both cull and fade identically.
 */
export function projectLatLng(
  lat: number,
  lng: number,
  camera: THREE.Camera,
  size: { width: number; height: number },
  scratch: THREE.Vector3,
  limit = FACING_LIMIT,
): ScreenPoint | null {
  const [x, y, z] = latLngToXYZ(lat, lng, 1.01);
  scratch.set(x, y, z);
  const facing = scratch.clone().normalize().dot(camera.position.clone().normalize());
  if (facing <= limit) return null;
  scratch.project(camera);
  return {
    x: ((scratch.x + 1) / 2) * size.width,
    y: ((1 - scratch.y) / 2) * size.height,
    facing,
  };
}

/** Fade factor (0–1) as a point nears the limb, shared by markers and country labels. */
export function limbFade(facing: number): number {
  return THREE.MathUtils.clamp((facing - 0.02) / 0.25, 0, 1);
}
