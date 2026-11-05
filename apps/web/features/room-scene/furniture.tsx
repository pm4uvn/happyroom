"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BIRTHDAY_ROOM, type ThemePalette } from "@happyroom/shared";

const pos = (id: (typeof BIRTHDAY_ROOM.interactables)[number]["id"]) => {
  const p = BIRTHDAY_ROOM.interactables.find((i) => i.id === id)!.position;
  return [p.x, 0, p.z] as [number, number, number];
};

export function GiftTable({ palette, shadows }: { palette: ThemePalette; shadows: boolean }) {
  const boxes: { p: [number, number, number]; s: number; c: string; r: string }[] = [
    { p: [-0.55, 0, 0.1], s: 0.38, c: palette.accent, r: "#F5C870" },
    { p: [0.05, 0, -0.15], s: 0.3, c: "#F9A6BA", r: "#ffffff" },
    { p: [0.55, 0, 0.15], s: 0.44, c: "#6BCBBE", r: "#F9A6BA" },
  ];
  return (
    <group position={pos("gift_table")} rotation-y={Math.PI / 2}>
      <mesh position={[0, 0.68, 0]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[2.1, 0.08, 1.2]} />
        <meshStandardMaterial color="#ffffff" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.5, 0.6]}>
        <boxGeometry args={[2.1, 0.32, 0.02]} />
        <meshStandardMaterial color={palette.accentSoft} roughness={1} />
      </mesh>
      {[
        [-0.95, -0.5],
        [0.95, -0.5],
        [-0.95, 0.5],
        [0.95, 0.5],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x!, 0.32, z!]}>
          <cylinderGeometry args={[0.04, 0.04, 0.64, 8]} />
          <meshStandardMaterial color={palette.accent} />
        </mesh>
      ))}
      {boxes.map((b, i) => (
        <group key={i} position={[b.p[0], 0.72 + b.s / 2, b.p[2]]}>
          <mesh castShadow={shadows}>
            <boxGeometry args={[b.s, b.s, b.s]} />
            <meshStandardMaterial color={b.c} roughness={0.55} />
          </mesh>
          <mesh>
            <boxGeometry args={[b.s + 0.01, b.s + 0.01, 0.06]} />
            <meshStandardMaterial color={b.r} roughness={0.4} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.06, b.s + 0.01, b.s + 0.01]} />
            <meshStandardMaterial color={b.r} roughness={0.4} />
          </mesh>
          <mesh position={[0, b.s / 2 + 0.05, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.07, 0.025, 8, 16]} />
            <meshStandardMaterial color={b.r} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function MemoryWall({ palette }: { palette: ThemePalette }) {
  const [x, , z] = pos("memory_wall");
  const frames = useMemo(
    () =>
      [-2.2, -1.3, -0.4, 0.5, 1.4, 2.3].map((fx, i) => ({
        x: fx,
        y: 1.75 + (i % 2 === 0 ? 0.18 : -0.12),
        rot: ((i * 37) % 9) / 60 - 0.07,
        color: [palette.accent, "#F9A6BA", "#6BCBBE", "#F5C870", palette.accentSoft, "#8EC5FF"][i]!,
      })),
    [palette],
  );
  return (
    <group position={[x, 0, z - 0.35]}>
      {/* Cork board */}
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[5.8, 1.6, 0.06]} />
        <meshStandardMaterial color="#E8CFA6" roughness={1} />
      </mesh>
      <mesh position={[0, 1.75, -0.01]}>
        <boxGeometry args={[6, 1.8, 0.04]} />
        <meshStandardMaterial color={palette.accent} roughness={0.7} />
      </mesh>
      {frames.map((f, i) => (
        <group key={i} position={[f.x, f.y, 0.045]} rotation-z={f.rot}>
          <mesh>
            <planeGeometry args={[0.62, 0.72]} />
            <meshStandardMaterial color="#ffffff" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.06, 0.002]}>
            <planeGeometry args={[0.52, 0.48]} />
            <meshStandardMaterial color={f.color} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.33, 0.01]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshStandardMaterial color="#D64560" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function PhotoBooth({ palette, shadows }: { palette: ThemePalette; shadows: boolean }) {
  return (
    <group position={pos("photo_booth")} rotation-y={-Math.PI / 4}>
      <mesh position={[0, 1.2, -0.6]} castShadow={shadows}>
        <boxGeometry args={[2, 2.4, 0.08]} />
        <meshStandardMaterial color={palette.accentSoft} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.02, -0.6]} rotation-z={Math.PI}>
        <torusGeometry args={[0.9, 0.08, 10, 32, Math.PI]} />
        <meshStandardMaterial color={palette.accent} roughness={0.5} />
      </mesh>
      {/* Star decals */}
      {[
        [-0.55, 1.9],
        [0.6, 1.6],
        [-0.2, 1.3],
      ].map(([sx, sy], i) => (
        <mesh key={i} position={[sx!, sy!, -0.55]} rotation-z={i * 0.4}>
          <circleGeometry args={[0.12, 5]} />
          <meshBasicMaterial color="#F5C870" />
        </mesh>
      ))}
      {/* Camera on tripod */}
      <group position={[0, 0, 0.9]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.5, 0]} rotation={[0.2, (i * Math.PI * 2) / 3, 0.18]}>
            <cylinderGeometry args={[0.02, 0.02, 1.05, 6]} />
            <meshStandardMaterial color="#182238" />
          </mesh>
        ))}
        <mesh position={[0, 1.08, 0]}>
          <boxGeometry args={[0.36, 0.24, 0.2]} />
          <meshStandardMaterial color="#182238" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.08, -0.13]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.08, 0.08, 0.08, 16]} />
          <meshStandardMaterial color="#46506a" metalness={0.4} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

export function Doorway({ palette }: { palette: ThemePalette }) {
  const [x, , z] = pos("door");
  return (
    <group position={[x, 0, z - 0.4]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <planeGeometry args={[1.8, 0.9]} />
        <meshStandardMaterial color={palette.accent} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <planeGeometry args={[1.6, 0.7]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>
      {[-1.4, 1.4].map((px) => (
        <group key={px} position={[px, 0, 0]}>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.22, 0.17, 0.5, 16]} />
            <meshStandardMaterial color="#F5C870" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <sphereGeometry args={[0.34, 14, 12]} />
            <meshStandardMaterial color="#6BCBBE" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Warm fairy lights strung along the top of the left wall (instanced, gently twinkling). */
export function FairyLights({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 26;
  const { bounds, wallHeight } = BIRTHDAY_ROOM;
  const base = useMemo(() => new THREE.Color("#FFE7A3"), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const z = bounds.minZ + 0.4 + t * (bounds.maxZ - bounds.minZ - 0.8);
      const sag = Math.sin(((t * 3) % 1) * Math.PI) * 0.25;
      m.makeTranslation(bounds.minX + 0.05, wallHeight - 0.25 - sag, z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, base);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [base, bounds, wallHeight]);

  const c = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh || reducedMotion) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const k = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.3);
      mesh.setColorAt(i, c.copy(base).multiplyScalar(k));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
