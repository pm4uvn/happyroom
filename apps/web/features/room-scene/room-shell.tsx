"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BIRTHDAY_ROOM, type ThemePalette } from "@happyroom/shared";

const { bounds, wallHeight } = BIRTHDAY_ROOM;
const width = bounds.maxX - bounds.minX;
const depth = bounds.maxZ - bounds.minZ;

/** Floor, two back walls (camera looks in from the open front-right), window, rug and bunting. */
export function RoomShell({ palette, shadows }: { palette: ThemePalette; shadows: boolean }) {
  return (
    <group>
      {/* Floor */}
      <mesh position={[0, -0.1, 0]} receiveShadow={shadows}>
        <boxGeometry args={[width + 0.4, 0.2, depth + 0.4]} />
        <meshStandardMaterial color={palette.floor} roughness={0.85} />
      </mesh>
      {/* Plank lines for texture without a texture download */}
      <FloorPlanks color={palette.floor} />
      {/* Round rug under the cake */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} receiveShadow={shadows}>
        <circleGeometry args={[2.3, 48]} />
        <meshStandardMaterial color={palette.accentSoft} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, 0]}>
        <ringGeometry args={[2.05, 2.15, 48]} />
        <meshStandardMaterial color="#ffffff" roughness={1} />
      </mesh>

      {/* Back wall (-Z) */}
      <mesh position={[0, wallHeight / 2, bounds.minZ - 0.1]} receiveShadow={shadows}>
        <boxGeometry args={[width + 0.4, wallHeight, 0.2]} />
        <meshStandardMaterial color={palette.wall} roughness={0.95} />
      </mesh>
      {/* Left wall (-X) */}
      <mesh position={[bounds.minX - 0.1, wallHeight / 2, 0]} receiveShadow={shadows}>
        <boxGeometry args={[0.2, wallHeight, depth + 0.4]} />
        <meshStandardMaterial color={palette.wall} roughness={0.95} />
      </mesh>
      {/* Baseboards */}
      <mesh position={[0, 0.08, bounds.minZ + 0.02]}>
        <boxGeometry args={[width + 0.4, 0.16, 0.06]} />
        <meshStandardMaterial color={palette.accent} roughness={0.6} />
      </mesh>
      <mesh position={[bounds.minX + 0.02, 0.08, 0]}>
        <boxGeometry args={[0.06, 0.16, depth + 0.4]} />
        <meshStandardMaterial color={palette.accent} roughness={0.6} />
      </mesh>

      {/* Window on the left wall */}
      <group position={[bounds.minX + 0.02, 1.9, 2.2]} rotation-y={Math.PI / 2}>
        <mesh>
          <planeGeometry args={[2.2, 1.4]} />
          <meshBasicMaterial color={palette.sky} />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <boxGeometry args={[2.36, 0.08, 0.04]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <boxGeometry args={[0.08, 1.56, 0.04]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 1.14, 0, 0.01]}>
            <boxGeometry args={[0.08, 1.56, 0.04]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={`h${s}`} position={[0, s * 0.74, 0.01]}>
            <boxGeometry args={[2.36, 0.08, 0.04]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        ))}
      </group>

      <Bunting palette={palette} />
    </group>
  );
}

function FloorPlanks({ color }: { color: string }) {
  const darker = useMemo(() => new THREE.Color(color).multiplyScalar(0.92).getStyle(), [color]);
  const lines = useMemo(() => {
    const out: number[] = [];
    for (let x = bounds.minX + 1; x < bounds.maxX; x += 1) out.push(x);
    return out;
  }, []);
  return (
    <group>
      {lines.map((x) => (
        <mesh key={x} position={[x, 0.002, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.025, depth]} />
          <meshBasicMaterial color={darker} />
        </mesh>
      ))}
    </group>
  );
}

/** Triangular party flags across the back wall, as one instanced mesh. */
function Bunting({ palette }: { palette: ThemePalette }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 22;
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.42, 0], 3));
    g.computeVertexNormals();
    return g;
  }, []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const colors = [palette.accent, palette.accentSoft, "#F5C870", "#6BCBBE", "#ffffff"];
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = bounds.minX + 0.6 + t * (width - 1.2);
      const sag = Math.sin(t * Math.PI) * 0.35;
      m.makeTranslation(x, wallHeight - 0.35 - sag, bounds.minZ + 0.03);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(colors[i % colors.length]!));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [palette]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]}>
      <meshStandardMaterial side={THREE.DoubleSide} roughness={0.8} />
    </instancedMesh>
  );
}
