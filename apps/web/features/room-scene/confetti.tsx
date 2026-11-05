"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COLORS = ["#9178E8", "#F9A6BA", "#F5C870", "#6BCBBE", "#ffffff"];
const LIFETIME = 4.5;

/**
 * GPU-cheap confetti burst: one instanced mesh, CPU-integrated particles.
 * Fires whenever `burstKey` changes (and is > 0). Disabled entirely with reduced motion.
 */
export function Confetti({
  burstKey,
  count,
  origin = [0, 1.6, 0],
}: {
  burstKey: number;
  count: number;
  origin?: [number, number, number];
}) {
  const [ox, oy, oz] = origin;
  const ref = useRef<THREE.InstancedMesh>(null);
  const sim = useMemo(
    () => ({
      p: new Float32Array(count * 3),
      v: new Float32Array(count * 3),
      r: new Float32Array(count * 3),
      age: -1,
    }),
    [count],
  );
  const tmp = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      mesh.setColorAt(i, c.set(COLORS[i % COLORS.length]!));
      tmp.scale.setScalar(0);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, tmp]);

  useEffect(() => {
    if (burstKey <= 0) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 3.5 + Math.random() * 3;
      const out = 1 + Math.random() * 2.5;
      sim.p.set([ox, oy, oz], i * 3);
      sim.v.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
      sim.r.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    }
    sim.age = 0;
  }, [burstKey, count, ox, oy, oz, sim]);

  useFrame((_, rawDt) => {
    const mesh = ref.current;
    if (!mesh || sim.age < 0) return;
    const dt = Math.min(rawDt, 1 / 30);
    sim.age += dt;
    const alive = sim.age < LIFETIME;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      if (alive) {
        sim.v[o + 1]! -= 6.5 * dt;
        // Air drag keeps it floaty.
        sim.v[o]! *= 0.985;
        sim.v[o + 2]! *= 0.985;
        sim.v[o + 1]! = Math.max(sim.v[o + 1]!, -1.4);
        sim.p[o]! += sim.v[o]! * dt;
        sim.p[o + 1]! = Math.max(0.01, sim.p[o + 1]! + sim.v[o + 1]! * dt);
        sim.p[o + 2]! += sim.v[o + 2]! * dt;
      }
      tmp.position.set(sim.p[o]!, sim.p[o + 1]!, sim.p[o + 2]!);
      tmp.rotation.set(sim.r[o]! + sim.age * 4, sim.r[o + 1]! + sim.age * 3, sim.r[o + 2]!);
      tmp.scale.setScalar(alive ? 1 : 0);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (!alive) sim.age = -1;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[0.07, 0.11]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}
