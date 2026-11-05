"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LabelAnchor, type LabelRegistry } from "./labels";
import { AVATAR_PRESETS, type AvatarAnimationState, type AvatarPresetId } from "@happyroom/shared";

export interface AvatarProps {
  preset: AvatarPresetId;
  position: [number, number, number];
  rotationY?: number;
  animation: AvatarAnimationState;
  /** Change this to restart the current animation (e.g. the same emote twice). */
  animationKey?: number;
  /** Screen-space name tag anchor (see labels.tsx); the DOM label is rendered outside the Canvas. */
  label?: { id: string; registry: LabelRegistry };
  reducedMotion?: boolean;
  shadows?: boolean;
  seed?: number;
  /** Highlight ring, e.g. for the local player or the host. */
  ring?: string;
}

const SHOULDER_Y = 0.78;
const ARM_LEN = 0.3;

/**
 * Stylised procedural avatar (no external model). Animation states are driven procedurally so
 * they cost nothing to download and stay in sync with the authoritative state on the server.
 */
export function Avatar({
  preset,
  position,
  rotationY = 0,
  animation,
  animationKey = 0,
  label,
  reducedMotion = false,
  shadows = false,
  seed = 0,
  ring,
}: AvatarProps) {
  const def = AVATAR_PRESETS[preset];
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const started = useRef<{ key: string; t: number }>({ key: "", t: 0 });
  const skin = useMemo(
    () => new THREE.Color(def.body).lerp(new THREE.Color("#ffffff"), 0.55).getStyle(),
    [def.body],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const key = `${animation}:${animationKey}`;
    if (started.current.key !== key) started.current = { key, t };
    const since = t - started.current.t;
    const b = body.current;
    const l = armL.current;
    const r = armR.current;
    if (!b || !l || !r) return;

    // Defaults (rest pose).
    let y = 0;
    let spin = 0;
    let lz = 0.25;
    let rz = -0.25;
    let lx = 0;
    let rx = 0;

    if (!reducedMotion) {
      switch (animation) {
        case "idle":
          y = Math.sin(t * 2 + seed) * 0.025;
          lz = 0.22 + Math.sin(t * 1.6 + seed) * 0.05;
          rz = -lz;
          break;
        case "walk": {
          const w = t * 9;
          y = Math.abs(Math.sin(w)) * 0.06;
          lx = Math.sin(w) * 0.7;
          rx = -lx;
          break;
        }
        case "run": {
          // Faster cadence, bigger arm swing and bounce, slight forward lean via the hop.
          const w = t * 15;
          y = Math.abs(Math.sin(w)) * 0.12;
          lx = Math.sin(w) * 1.2;
          rx = -lx;
          break;
        }
        case "wave":
          rz = -2.5 + Math.sin(since * 11) * 0.35;
          y = Math.sin(t * 2 + seed) * 0.02;
          break;
        case "clap": {
          const c = Math.abs(Math.sin(since * 12));
          lx = rx = -1.25;
          // Arms forward, swinging from apart (0.35) to together (-0.1).
          lz = 0.35 - c * 0.45;
          rz = -lz;
          break;
        }
        case "dance":
          y = Math.abs(Math.sin(since * 6)) * 0.14;
          spin = Math.sin(since * 3.2) * 0.7;
          lz = 2.2 + Math.sin(since * 6) * 0.5;
          rz = -2.2 + Math.sin(since * 6 + Math.PI) * 0.5;
          break;
        case "celebrate":
          y = Math.abs(Math.sin(since * 5.2)) * 0.32;
          lz = 2.6;
          rz = -2.6;
          break;
      }
    } else if (animation === "wave" || animation === "celebrate") {
      // Still communicate the pose without motion.
      rz = -2.5;
      if (animation === "celebrate") lz = 2.6;
    }

    b.position.y = y;
    b.rotation.y = spin;
    l.rotation.set(lx, 0, lz);
    r.rotation.set(rx, 0, rz);
  });

  return (
    <group ref={root} position={position} rotation-y={rotationY}>
      {ring && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
          <ringGeometry args={[0.36, 0.44, 32]} />
          <meshBasicMaterial color={ring} transparent opacity={0.85} />
        </mesh>
      )}
      {/* Soft blob shadow: cheaper than real shadows and readable on any floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.32, 24]} />
        <meshBasicMaterial color="#182238" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <group ref={body}>
        {/* Feet */}
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 0.07, 0.03]} scale={[1, 0.7, 1.3]}>
            <sphereGeometry args={[0.09, 12, 10]} />
            <meshStandardMaterial color={def.accent} roughness={0.6} />
          </mesh>
        ))}
        {/* Torso */}
        <mesh position={[0, 0.5, 0]} castShadow={shadows}>
          <capsuleGeometry args={[0.26, 0.3, 6, 16]} />
          <meshStandardMaterial color={def.body} roughness={0.55} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1.12, 0]} castShadow={shadows}>
          <sphereGeometry args={[0.31, 24, 20]} />
          <meshStandardMaterial color={skin} roughness={0.6} />
        </mesh>
        {/* Face */}
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 1.15, 0.28]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshBasicMaterial color="#182238" />
          </mesh>
        ))}
        {[-0.17, 0.17].map((x) => (
          <mesh key={`c${x}`} position={[x, 1.06, 0.25]} rotation-y={x * 1.5}>
            <circleGeometry args={[0.045, 12]} />
            <meshBasicMaterial color="#F9A6BA" transparent opacity={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 1.04, 0.29]} rotation-z={Math.PI}>
          <torusGeometry args={[0.045, 0.012, 6, 12, Math.PI]} />
          <meshBasicMaterial color="#182238" />
        </mesh>
        <Accessory kind={def.accessory} accent={def.accent} />
        {/* Arms pivot at the shoulders */}
        <group ref={armL} position={[0.27, SHOULDER_Y, 0]}>
          <mesh position={[0, -ARM_LEN / 2, 0]}>
            <capsuleGeometry args={[0.07, ARM_LEN - 0.1, 4, 8]} />
            <meshStandardMaterial color={def.body} roughness={0.55} />
          </mesh>
        </group>
        <group ref={armR} position={[-0.27, SHOULDER_Y, 0]}>
          <mesh position={[0, -ARM_LEN / 2, 0]}>
            <capsuleGeometry args={[0.07, ARM_LEN - 0.1, 4, 8]} />
            <meshStandardMaterial color={def.body} roughness={0.55} />
          </mesh>
        </group>
      </group>
      {label && <LabelAnchor id={label.id} registry={label.registry} position={[0, 1.85, 0]} />}
    </group>
  );
}

function Accessory({ kind, accent }: { kind: string; accent: string }) {
  switch (kind) {
    case "party_hat":
      return (
        <group position={[0, 1.42, 0]} rotation-z={0.15}>
          <mesh position={[0, 0.16, 0]}>
            <coneGeometry args={[0.15, 0.36, 16]} />
            <meshStandardMaterial color={accent} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.36, 0]}>
            <sphereGeometry args={[0.05, 10, 8]} />
            <meshStandardMaterial color="#F5C870" />
          </mesh>
        </group>
      );
    case "bow":
      return (
        <group position={[0.16, 1.38, 0.05]} rotation-z={-0.4}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.08, 0, 0]} rotation-z={s * 0.5} scale={[1, 0.65, 0.5]}>
              <sphereGeometry args={[0.09, 12, 10]} />
              <meshStandardMaterial color={accent === "#182238" ? "#D64560" : accent} roughness={0.5} />
            </mesh>
          ))}
        </group>
      );
    case "crown":
      return (
        <group position={[0, 1.44, 0]}>
          <mesh>
            <cylinderGeometry args={[0.16, 0.16, 0.1, 16, 1, true]} />
            <meshStandardMaterial color="#F5C870" metalness={0.5} roughness={0.3} side={THREE.DoubleSide} />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.16, 0.09, Math.sin(a) * 0.16]}>
                <coneGeometry args={[0.035, 0.09, 6]} />
                <meshStandardMaterial color="#F5C870" metalness={0.5} roughness={0.3} />
              </mesh>
            );
          })}
        </group>
      );
    case "headphones":
      return (
        <group position={[0, 1.14, 0]}>
          <mesh rotation-z={Math.PI / 2} rotation-y={Math.PI / 2}>
            <torusGeometry args={[0.33, 0.03, 8, 24, Math.PI]} />
            <meshStandardMaterial color={accent} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.32, 0, 0]} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.09, 0.09, 0.07, 16]} />
              <meshStandardMaterial color={accent} />
            </mesh>
          ))}
        </group>
      );
    case "flower":
      return (
        <group position={[-0.18, 1.36, 0.12]}>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <mesh key={i} position={[Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0]}>
                <sphereGeometry args={[0.045, 8, 8]} />
                <meshStandardMaterial color="#F9A6BA" />
              </mesh>
            );
          })}
          <mesh>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#F5C870" />
          </mesh>
        </group>
      );
    case "beanie":
      return (
        <group position={[0, 1.2, 0]}>
          <mesh>
            <sphereGeometry args={[0.325, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
            <meshStandardMaterial color={accent} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial color="#ffffff" roughness={1} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}
