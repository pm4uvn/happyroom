"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface BalloonSpec {
  x: number;
  y: number;
  z: number;
  color: string;
  phase: number;
}

const CLUSTERS: [number, number][] = [
  [-6.2, -5.2],
  [3.6, -5.3],
  [-6.2, 4.6],
  [-1.6, 5.4],
  [1.6, 5.4],
];

/** Balloon clusters drawn with two instanced meshes (balloons + strings): 2 draw calls total. */
export function Balloons({ colors, reducedMotion }: { colors: readonly string[]; reducedMotion: boolean }) {
  const balloons = useMemo<BalloonSpec[]>(() => {
    const out: BalloonSpec[] = [];
    CLUSTERS.forEach(([cx, cz], ci) => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + ci;
        out.push({
          x: cx + Math.cos(a) * 0.28,
          z: cz + Math.sin(a) * 0.28,
          y: 2.1 + ((i + ci) % 3) * 0.3,
          color: colors[(i + ci) % colors.length] ?? "#9178E8",
          phase: ci * 1.7 + i,
        });
      }
    });
    return out;
  }, [colors]);

  const balloonRef = useRef<THREE.InstancedMesh>(null);
  const stringRef = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);

  const place = (t: number) => {
    const b = balloonRef.current;
    const s = stringRef.current;
    if (!b || !s) return;
    balloons.forEach((spec, i) => {
      const bob = reducedMotion ? 0 : Math.sin(t * 1.2 + spec.phase) * 0.06;
      const sway = reducedMotion ? 0 : Math.sin(t * 0.8 + spec.phase) * 0.04;
      tmp.position.set(spec.x + sway, spec.y + bob, spec.z);
      tmp.rotation.set(0, 0, sway);
      tmp.scale.set(1, 1.18, 1);
      tmp.updateMatrix();
      b.setMatrixAt(i, tmp.matrix);
      // String from the balloon knot down to a weight on the floor.
      const top = spec.y + bob - 0.36;
      tmp.position.set(spec.x + sway / 2, top / 2, spec.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, top, 1);
      tmp.updateMatrix();
      s.setMatrixAt(i, tmp.matrix);
    });
    b.instanceMatrix.needsUpdate = true;
    s.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const b = balloonRef.current;
    if (!b) return;
    const c = new THREE.Color();
    balloons.forEach((spec, i) => b.setColorAt(i, c.set(spec.color)));
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    place(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balloons]);

  useFrame((state) => {
    if (!reducedMotion) place(state.clock.elapsedTime);
  });

  return (
    <group>
      <instancedMesh ref={balloonRef} args={[undefined, undefined, balloons.length]} castShadow={false}>
        <sphereGeometry args={[0.3, 20, 16]} />
        <meshStandardMaterial roughness={0.25} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={stringRef} args={[undefined, undefined, balloons.length]}>
        <cylinderGeometry args={[0.006, 0.006, 1, 4]} />
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
    </group>
  );
}
