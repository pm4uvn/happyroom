"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { clampToBounds, normalizeAngle, resolveCollisions } from "@happyroom/game-core";
import {
  AVATAR_PRESET_IDS,
  BIRTHDAY_ROOM,
  type AvatarAnimationState,
  type AvatarPresetId,
  type EmoteId,
} from "@happyroom/shared";
import { Avatar } from "@/features/room-scene/avatar";
import { LabelAnchor, type LabelRegistry } from "@/features/room-scene/labels";
import type { PartyConnection, PlayerView } from "./connection";
import { readInput, type MoveInput } from "./input";

const WALK_SPEED = 3.0; // m/s, below the server's 3.2 m/s cap
const SEND_INTERVAL_MS = 80; // 12.5 Hz
const EMOTE_ANIM: Record<EmoteId, AvatarAnimationState> = {
  wave: "wave",
  clap: "clap",
  dance: "dance",
  celebrate: "celebrate",
  heart: "wave",
  laugh: "clap",
};

export function animationFor(
  p: Pick<PlayerView, "emote" | "moving">,
  celebrating: boolean,
): AvatarAnimationState {
  if (p.emote && p.emote in EMOTE_ANIM) return EMOTE_ANIM[p.emote as EmoteId];
  if (p.moving) return "walk";
  return celebrating ? "celebrate" : "idle";
}

const asPreset = (a: string): AvatarPresetId =>
  (AVATAR_PRESET_IDS as readonly string[]).includes(a) ? (a as AvatarPresetId) : "sunny";

/** Shared local-player position, readable by the camera rig. */
export interface LocalPose {
  x: number;
  z: number;
  rotY: number;
  ready: boolean;
}

/**
 * The local player: predicted immediately from input (no input lag), collided against the same
 * layout the server uses, sent at 12.5 Hz, and snapped back when the server corrects it.
 */
export function LocalPlayer({
  conn,
  me,
  inputRef,
  poseRef,
  registry,
  celebrating,
  reducedMotion,
  onFirstMove,
}: {
  conn: PartyConnection;
  me: PlayerView;
  inputRef: RefObject<MoveInput>;
  poseRef: RefObject<LocalPose>;
  registry: LabelRegistry;
  celebrating: boolean;
  reducedMotion: boolean;
  onFirstMove: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const [moving, setMoving] = useState(false);
  const seq = useRef(0);
  const lastSent = useRef({ t: 0, x: NaN, z: NaN, moving: false });
  const firstMove = useRef(false);
  const fwdRef = useRef(new THREE.Vector3());

  // Initialise from the authoritative spawn, and accept server corrections.
  useEffect(() => {
    const pose = poseRef.current;
    if (!pose.ready) {
      pose.x = me.x;
      pose.z = me.z;
      pose.rotY = me.rotY;
      pose.ready = true;
    }
    return conn.onCorrection((c) => {
      pose.x = c.x;
      pose.z = c.z;
    });
  }, [conn, me.x, me.z, me.rotY, poseRef]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const pose = poseRef.current;
    const fwd = fwdRef.current;
    const live = conn.live.get(conn.selfId);
    // Large divergence (e.g. after reconnect) → trust the server.
    if (live && Math.hypot(live.x - pose.x, live.z - pose.z) > 2.5) {
      pose.x = live.x;
      pose.z = live.z;
    }

    const { x: ix, y: iy } = readInput(inputRef.current);
    const isMoving = Math.hypot(ix, iy) > 0.05;
    if (isMoving) {
      // Camera-relative directions on the floor plane.
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      const rightX = -fwd.z;
      const rightZ = fwd.x;
      const dx = (fwd.x * iy + rightX * ix) * WALK_SPEED * dt;
      const dz = (fwd.z * iy + rightZ * ix) * WALK_SPEED * dt;
      const next = resolveCollisions(
        clampToBounds({ x: pose.x + dx, z: pose.z + dz }, BIRTHDAY_ROOM),
        BIRTHDAY_ROOM,
      ).pos;
      pose.x = next.x;
      pose.z = next.z;
      pose.rotY = Math.atan2(dx, dz);
      if (!firstMove.current) {
        firstMove.current = true;
        onFirstMove();
      }
    }
    if (isMoving !== moving) setMoving(isMoving);

    const g = group.current;
    if (g) {
      g.position.set(pose.x, 0, pose.z);
      const diff = normalizeAngle(pose.rotY - g.rotation.y);
      g.rotation.y = reducedMotion ? pose.rotY : g.rotation.y + diff * Math.min(1, dt * 14);
    }

    const now = performance.now();
    const ls = lastSent.current;
    const changed =
      Math.abs(ls.x - pose.x) > 0.005 || Math.abs(ls.z - pose.z) > 0.005 || ls.moving !== isMoving;
    if (changed && now - ls.t >= SEND_INTERVAL_MS) {
      seq.current += 1;
      if (conn.send("move", { seq: seq.current, x: pose.x, z: pose.z, rotY: pose.rotY, moving: isMoving })) {
        lastSent.current = { t: now, x: pose.x, z: pose.z, moving: isMoving };
      }
    }
  });

  return (
    <group ref={group} position={[me.x, 0, me.z]}>
      <Avatar
        preset={asPreset(me.avatar)}
        position={[0, 0, 0]}
        animation={animationFor({ emote: me.emote, moving }, celebrating)}
        animationKey={me.emoteSeq}
        reducedMotion={reducedMotion}
        ring="#9178E8"
        label={{ id: me.id, registry }}
      />
    </group>
  );
}

/** A remote participant, interpolated towards the latest authoritative position. */
export function RemotePlayer({
  conn,
  player,
  registry,
  celebrating,
  reducedMotion,
}: {
  conn: PartyConnection;
  player: PlayerView;
  registry: LabelRegistry;
  celebrating: boolean;
  reducedMotion: boolean;
}) {
  const group = useRef<THREE.Group>(null);

  useFrame((_, rawDt) => {
    const g = group.current;
    const live = conn.live.get(player.id);
    if (!g || !live) return;
    const dt = Math.min(rawDt, 0.1);
    const far = Math.hypot(live.x - g.position.x, live.z - g.position.z) > 4;
    if (reducedMotion || far) {
      g.position.set(live.x, 0, live.z);
      g.rotation.y = live.rotY;
      return;
    }
    // Exponential smoothing ≈ ~100 ms of interpolation delay at 20 Hz patches.
    const k = 1 - Math.exp(-dt * 12);
    g.position.x += (live.x - g.position.x) * k;
    g.position.z += (live.z - g.position.z) * k;
    g.rotation.y += normalizeAngle(live.rotY - g.rotation.y) * k;
  });

  return (
    <group ref={group} position={[player.x, 0, player.z]} rotation-y={player.rotY}>
      <group visible={player.connected}>
        <Avatar
          preset={asPreset(player.avatar)}
          position={[0, 0, 0]}
          animation={animationFor(player, celebrating)}
          animationKey={player.emoteSeq}
          reducedMotion={reducedMotion}
          ring={player.role === "host" ? "#F5C870" : undefined}
          label={{ id: player.id, registry }}
        />
      </group>
      {!player.connected && (
        <LabelAnchor id={`${player.id}-offline`} registry={registry} position={[0, 1.2, 0]} />
      )}
    </group>
  );
}

const CAKE_FOCUS = new THREE.Vector3(
  BIRTHDAY_ROOM.ceremonyFocus.x,
  BIRTHDAY_ROOM.ceremonyFocus.y,
  BIRTHDAY_ROOM.ceremonyFocus.z,
);
const FOLLOW_OFFSET = new THREE.Vector3(5.5, 7, 7.5);
const CEREMONY_OFFSET = new THREE.Vector3(3.2, 3.4, 4.4);

/** Isometric follow camera; glides towards the cake while the ceremony is running. */
export function CameraRig({
  poseRef,
  focusCake,
  reducedMotion,
}: {
  poseRef: RefObject<LocalPose>;
  focusCake: boolean;
  reducedMotion: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const look = useRef(new THREE.Vector3(0, 0.8, 0));
  const desired = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDt) => {
    const pose = poseRef.current;
    if (!pose.ready) return;
    const dt = Math.min(rawDt, 0.1);
    if (focusCake) {
      target.copy(CAKE_FOCUS);
      desired.copy(CAKE_FOCUS).add(CEREMONY_OFFSET);
    } else {
      target.set(pose.x, 0.8, pose.z);
      desired.set(pose.x, 0, pose.z).add(FOLLOW_OFFSET);
    }
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * (focusCake ? 2.2 : 5));
    camera.position.lerp(desired, k);
    look.current.lerp(target, k);
    camera.lookAt(look.current);
  });
  return null;
}
