"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { AVATAR_IDS, buildZoneCollision, normalizeAngle, type ZoneDefinition } from "@happyroom/world";
import type { AvatarAnimationState, AvatarPresetId } from "@happyroom/shared";
import { Avatar } from "@/features/room-scene/avatar";
import { LabelAnchor, type LabelRegistry } from "@/features/room-scene/labels";
import { stepCharacter, type Pose } from "../engine/character-controller";
import { readWorldInput, type WorldInput } from "../engine/input";
import { findFocus, type Focus } from "../engine/interaction";
import type { LivePlayer, ZoneConnection } from "../engine/zone-connection";
import { ZoneEnvironment } from "./zone-environment";

export interface PerfStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  memoryMB: number | null;
  dpr: number;
}

export interface CameraState {
  yaw: number;
  pitch: number;
  distance: number;
}

const EMOTE_ANIM: Record<string, AvatarAnimationState> = {
  wave: "wave",
  clap: "clap",
  dance: "dance",
  celebrate: "celebrate",
  heart: "wave",
  laugh: "clap",
};
const asAvatar = (a: string): AvatarPresetId =>
  (AVATAR_IDS as readonly string[]).includes(a) ? (a as AvatarPresetId) : "sunny";
const animFor = (anim: string, emote: string): AvatarAnimationState =>
  emote && EMOTE_ANIM[emote]
    ? EMOTE_ANIM[emote]!
    : anim === "run"
      ? "run"
      : anim === "walk"
        ? "walk"
        : "idle";

export function WorldScene(props: {
  zone: ZoneDefinition;
  conn: ZoneConnection;
  selfAvatar: string;
  inputRef: RefObject<WorldInput>;
  poseRef: RefObject<Pose>;
  cameraRef: RefObject<CameraState>;
  registry: LabelRegistry;
  quality: "high" | "low";
  reducedMotion: boolean;
  onFocus: (f: Focus | null) => void;
  onStats: (s: PerfStats) => void;
  remoteIds: string[];
  selfEmote: { emote: string; seq: number };
}) {
  const [dpr, setDpr] = useState(props.quality === "high" ? 1.75 : 1);
  return (
    <Canvas
      dpr={dpr}
      shadows={props.quality === "high"}
      camera={{ position: [0, 8, 20], fov: 45, near: 0.1, far: 120 }}
      gl={{ antialias: props.quality === "high", powerPreference: "high-performance" }}
      style={{ touchAction: "none" }}
      data-testid="world-canvas"
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(props.quality === "high" ? 1.75 : 1)}
        flipflops={3}
      />
      <ZoneEnvironment zone={props.zone} quality={props.quality} />
      <LocalCharacter {...props} />
      {props.remoteIds.map((id) => (
        <RemoteCharacter
          key={id}
          id={id}
          conn={props.conn}
          registry={props.registry}
          reducedMotion={props.reducedMotion}
        />
      ))}
      <CameraController
        poseRef={props.poseRef}
        cameraRef={props.cameraRef}
        reducedMotion={props.reducedMotion}
      />
      <StatsProbe onStats={props.onStats} dpr={dpr} />
    </Canvas>
  );
}

function LocalCharacter(props: Parameters<typeof WorldScene>[0]) {
  const { zone, conn, inputRef, poseRef, cameraRef, onFocus } = props;
  const group = useRef<THREE.Group>(null);
  const collision = useMemo(() => buildZoneCollision(zone), [zone]);
  const [anim, setAnim] = useState<Pose["anim"]>("idle");
  const lastSent = useRef({ t: 0, x: NaN, z: NaN, anim: "idle" });
  const seq = useRef(0);
  const focusId = useRef<string | null>(null);

  useEffect(
    () => conn.onCorrection((c) => Object.assign(poseRef.current, { x: c.x, z: c.z })),
    [conn, poseRef],
  );

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const pose = poseRef.current;
    const live = conn.live.get(conn.selfId);
    if (live && Math.hypot(live.x - pose.x, live.z - pose.z) > 3)
      Object.assign(pose, { x: live.x, z: live.z });
    // Camera yaw (orbit) defines "forward"; the camera looks from behind the player towards it.
    const next = stepCharacter(
      pose,
      readWorldInput(inputRef.current),
      cameraRef.current.yaw + Math.PI,
      dt,
      collision,
    );
    Object.assign(pose, next);
    if (next.anim !== anim) setAnim(next.anim);
    const g = group.current;
    if (g) {
      g.position.set(pose.x, 0, pose.z);
      g.rotation.y = pose.rotY;
    }
    const f = findFocus(zone, pose.x, pose.z);
    if ((f?.id ?? null) !== focusId.current) {
      focusId.current = f?.id ?? null;
      onFocus(f);
    }
    const now = performance.now();
    const ls = lastSent.current;
    if (
      (Math.abs(ls.x - pose.x) > 0.005 || Math.abs(ls.z - pose.z) > 0.005 || ls.anim !== next.anim) &&
      now - ls.t >= 80
    ) {
      seq.current += 1;
      if (
        conn.send("move", {
          seq: seq.current,
          x: pose.x,
          z: pose.z,
          rotY: normalizeAngle(pose.rotY),
          anim: next.anim,
        })
      ) {
        lastSent.current = { t: now, x: pose.x, z: pose.z, anim: next.anim };
      }
    }
  });

  return (
    <group ref={group} name="local-player">
      <Avatar
        preset={asAvatar(props.selfAvatar)}
        position={[0, 0, 0]}
        animation={animFor(anim, props.selfEmote.emote)}
        animationKey={props.selfEmote.seq}
        reducedMotion={props.reducedMotion}
        ring="#9178E8"
        label={{ id: conn.selfId, registry: props.registry }}
      />
    </group>
  );
}

function RemoteCharacter({
  id,
  conn,
  registry,
  reducedMotion,
}: {
  id: string;
  conn: ZoneConnection;
  registry: LabelRegistry;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const [view, setView] = useState<Pick<LivePlayer, "avatar" | "anim" | "emote" | "emoteSeq" | "connected">>(
    () => {
      const p = conn.live.get(id);
      return {
        avatar: p?.avatar ?? "sunny",
        anim: p?.anim ?? "idle",
        emote: p?.emote ?? "",
        emoteSeq: p?.emoteSeq ?? 0,
        connected: p?.connected ?? true,
      };
    },
  );
  useFrame((_, raw) => {
    const p = conn.live.get(id);
    const g = group.current;
    if (!p || !g) return;
    const dt = Math.min(raw, 0.1);
    const far = Math.hypot(p.x - g.position.x, p.z - g.position.z) > 5;
    const k = reducedMotion || far ? 1 : 1 - Math.exp(-dt * 12); // ≈100 ms interpolation at 20 Hz
    g.position.x += (p.x - g.position.x) * k;
    g.position.z += (p.z - g.position.z) * k;
    g.rotation.y += normalizeAngle(p.rotY - g.rotation.y) * k;
    if (
      p.anim !== view.anim ||
      p.emote !== view.emote ||
      p.emoteSeq !== view.emoteSeq ||
      p.connected !== view.connected ||
      p.avatar !== view.avatar
    ) {
      setView({
        avatar: p.avatar,
        anim: p.anim,
        emote: p.emote,
        emoteSeq: p.emoteSeq,
        connected: p.connected,
      });
    }
  });
  const start = conn.live.get(id);
  return (
    <group ref={group} name={`player:${id}`} position={[start?.x ?? 0, 0, start?.z ?? 0]}>
      <group visible={view.connected}>
        <Avatar
          preset={asAvatar(view.avatar)}
          position={[0, 0, 0]}
          animation={animFor(view.anim, view.emote)}
          animationKey={view.emoteSeq}
          reducedMotion={reducedMotion}
          label={{ id, registry }}
        />
      </group>
      {!view.connected && <LabelAnchor id={`${id}-off`} registry={registry} position={[0, 1.2, 0]} />}
    </group>
  );
}

/**
 * CameraController — third-person follow with orbit (drag) and zoom (wheel / pinch) inside limits,
 * and obstruction handling: if a tree or building blocks the view, the camera moves in front of it.
 */
export const CAMERA_LIMITS = { minDistance: 5, maxDistance: 16, minPitch: 0.35, maxPitch: 1.15 };

function CameraController({
  poseRef,
  cameraRef,
  reducedMotion,
}: {
  poseRef: RefObject<Pose>;
  cameraRef: RefObject<CameraState>;
  reducedMotion: boolean;
}) {
  const { camera, gl, scene } = useThree();
  // Scratch objects reused every frame (kept in a ref: mutated outside render).
  const scratchRef = useRef({
    ray: new THREE.Raycaster(),
    target: new THREE.Vector3(),
    desired: new THREE.Vector3(),
    dir: new THREE.Vector3(),
  });
  const occluders = useRef<THREE.Object3D[]>([]);

  useEffect(() => {
    const list: THREE.Object3D[] = [];
    scene.traverse((o) => o.userData?.occluder && list.push(o));
    occluders.current = list;
  });

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.pointerType === "touch") return; // touch: drag = joystick area / pinch = zoom
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch)
          cameraRef.current.distance = THREE.MathUtils.clamp(
            cameraRef.current.distance * (pinch / d),
            CAMERA_LIMITS.minDistance,
            CAMERA_LIMITS.maxDistance,
          );
        pinch = d;
        return;
      }
      if (!dragging) return;
      cameraRef.current.yaw -= (e.clientX - lastX) * 0.006;
      cameraRef.current.pitch = THREE.MathUtils.clamp(
        cameraRef.current.pitch + (e.clientY - lastY) * 0.004,
        CAMERA_LIMITS.minPitch,
        CAMERA_LIMITS.maxPitch,
      );
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
      dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraRef.current.distance = THREE.MathUtils.clamp(
        cameraRef.current.distance * (1 + Math.sign(e.deltaY) * 0.1),
        CAMERA_LIMITS.minDistance,
        CAMERA_LIMITS.maxDistance,
      );
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, cameraRef]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
    const pose = poseRef.current;
    const cam = cameraRef.current;
    const tmp = scratchRef.current;
    const ray = tmp.ray;
    tmp.target.set(pose.x, 1.2, pose.z);
    // Obstruction handling: first try raising the camera over the obstacle (keeps the view wide),
    // then, if it is still blocked at the steepest allowed pitch, pull in front of the obstacle.
    const place = (pitch: number) => {
      const horiz = Math.cos(pitch) * cam.distance;
      tmp.desired.set(
        pose.x + Math.sin(cam.yaw) * horiz,
        1.2 + Math.sin(pitch) * cam.distance,
        pose.z + Math.cos(cam.yaw) * horiz,
      );
      tmp.dir.copy(tmp.desired).sub(tmp.target);
      const full = tmp.dir.length();
      tmp.dir.normalize();
      ray.set(tmp.target, tmp.dir);
      ray.far = full;
      return occluders.current.length ? ray.intersectObjects(occluders.current, true)[0] : undefined;
    };
    let pitch = cam.pitch;
    let hit = place(pitch);
    while (hit && pitch < CAMERA_LIMITS.maxPitch) {
      pitch = Math.min(CAMERA_LIMITS.maxPitch, pitch + 0.1);
      hit = place(pitch);
    }
    if (hit) tmp.desired.copy(tmp.target).addScaledVector(tmp.dir, Math.max(1.5, hit.distance - 0.4));
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    camera.position.lerp(tmp.desired, k);
    camera.lookAt(tmp.target);
  });
  return null;
}

/** FPS / draw calls / memory, sampled every second for the performance HUD and adaptive quality. */
function StatsProbe({ onStats, dpr }: { onStats: (s: PerfStats) => void; dpr: number }) {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ frames: 0, t: 0 });
  useFrame((_, dt) => {
    acc.current.frames += 1;
    acc.current.t += dt;
    if (acc.current.t < 1) return;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    onStats({
      fps: Math.round(acc.current.frames / acc.current.t),
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      memoryMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      dpr,
    });
    acc.current = { frames: 0, t: 0 };
  });
  return null;
}
