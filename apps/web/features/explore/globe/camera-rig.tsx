"use client";

import { useEffect, useRef, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;
import { latLngToXYZ } from "./geo";

export const MIN_DISTANCE = 1.55;
export const MAX_DISTANCE = 5.6;
const RESUME_AFTER_MS = 5000;
const FLY_MS = 1100;

export interface FocusTarget {
  lat: number;
  lng: number;
  /** Camera distance from the globe centre; keeps the current distance when omitted. */
  distance?: number;
  /** Changes whenever the same place should be flown to again. */
  key: number;
}

export interface ZoomCommand {
  factor: number;
  key: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * OrbitControls (drag to rotate, wheel/pinch to zoom within limits, no pan) + slow auto-rotation
 * that pauses while the user interacts or a fly-to runs, and stays off with reduced motion.
 */
export function CameraRig({
  focus,
  zoom,
  autoRotate,
  reducedMotion,
  onDistance,
}: {
  focus: FocusTarget | null;
  zoom: ZoomCommand | null;
  autoRotate: boolean;
  reducedMotion: boolean;
  onDistance: (distance: number) => void;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const invalidate = useThree((s) => s.invalidate);
  const state = useRef({
    interacting: false,
    resumeAt: 0,
    fly: null as null | {
      from: THREE.Vector3;
      to: THREE.Vector3;
      fromDist: number;
      toDist: number;
      start: number;
    },
    lastDistance: 0,
  });

  // Fly to a target (instant with reduced motion).
  useEffect(() => {
    const c = controls.current;
    if (!focus || !c) return;
    const cam = c.object;
    const fromDist = cam.position.length();
    const toDist = THREE.MathUtils.clamp(focus.distance ?? fromDist, MIN_DISTANCE, MAX_DISTANCE);
    const to = new THREE.Vector3(...latLngToXYZ(focus.lat, focus.lng, 1)).normalize();
    if (reducedMotion) {
      cam.position.copy(to.multiplyScalar(toDist));
      c.update();
      invalidate();
      return;
    }
    state.current.fly = {
      from: cam.position.clone().normalize(),
      to,
      fromDist,
      toDist,
      start: performance.now(),
    };
    state.current.resumeAt = performance.now() + FLY_MS + RESUME_AFTER_MS;
    invalidate();
  }, [focus, reducedMotion, invalidate]);

  // Zoom buttons.
  useEffect(() => {
    const c = controls.current;
    if (!zoom || !c) return;
    const cam = c.object;
    const target = THREE.MathUtils.clamp(cam.position.length() * zoom.factor, MIN_DISTANCE, MAX_DISTANCE);
    if (reducedMotion) {
      cam.position.setLength(target);
      c.update();
      invalidate();
      return;
    }
    const dir = cam.position.clone().normalize();
    state.current.fly = {
      from: dir,
      to: dir.clone(),
      fromDist: cam.position.length(),
      toDist: target,
      start: performance.now(),
    };
    invalidate();
  }, [zoom, reducedMotion, invalidate]);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const s = state.current;
    const now = performance.now();
    const fly = s.fly;
    if (fly) {
      const t = Math.min(1, (now - fly.start) / (fly.to.equals(fly.from) ? 450 : FLY_MS));
      const k = ease(t);
      const dir = fly.from.clone().lerp(fly.to, k);
      if (dir.lengthSq() < 1e-6) dir.copy(fly.to);
      dir.normalize();
      // Lift slightly mid-flight for long hops.
      const hop = Math.sin(Math.PI * k) * Math.min(0.6, fly.from.angleTo(fly.to) * 0.35);
      c.object.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(fly.fromDist, fly.toDist, k) + hop));
      c.update();
      if (t >= 1) s.fly = null;
      else invalidate();
    }
    const rotate = autoRotate && !reducedMotion && !s.interacting && !s.fly && now >= s.resumeAt;
    c.autoRotate = rotate;
    const dist = c.object.position.length();
    // Slower drag when zoomed in, so the surface follows the finger.
    c.rotateSpeed = 0.18 + (dist - 1) * 0.16;
    if (Math.abs(dist - s.lastDistance) > 0.02) {
      s.lastDistance = dist;
      onDistance(dist);
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      zoomSpeed={0.6}
      autoRotateSpeed={0.35}
      onStart={() => {
        state.current.interacting = true;
        state.current.fly = null;
      }}
      onEnd={() => {
        state.current.interacting = false;
        state.current.resumeAt = performance.now() + RESUME_AFTER_MS;
      }}
    />
  );
}
