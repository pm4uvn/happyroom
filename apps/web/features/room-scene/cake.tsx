"use client";

import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { CAKES, type CakeStyle } from "@happyroom/shared";

const TABLE_TOP = 0.78;
const TIER1_H = 0.32;
const TIER2_H = 0.26;
const TOP = TABLE_TOP + TIER1_H + TIER2_H;

export interface CakeProps {
  style: CakeStyle;
  candlesLit: boolean;
  accent: string;
  shadows: boolean;
  reducedMotion: boolean;
  label: string;
  onActivate?: () => void;
}

/** The central interactive object: table, two-tier cake, candles with flickering flames. */
export function Cake({ style, candlesLit, accent, shadows, reducedMotion, label, onActivate }: CakeProps) {
  const def = CAKES[style];
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = hovered && onActivate ? 1.04 : 1;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, target, 10, dt));
  });

  const interactive = Boolean(onActivate);
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onActivate?.();
  };

  return (
    <group
      ref={group}
      name={label}
      onClick={interactive ? onClick : undefined}
      onPointerOver={
        interactive
          ? (e) => {
              e.stopPropagation();
              setHovered(true);
              document.body.style.cursor = "pointer";
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => {
              setHovered(false);
              document.body.style.cursor = "";
            }
          : undefined
      }
    >
      {/* Round table with cloth */}
      <mesh position={[0, TABLE_TOP / 2, 0]} castShadow={shadows} receiveShadow={shadows}>
        <cylinderGeometry args={[0.95, 0.85, TABLE_TOP, 40]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </mesh>
      <mesh position={[0, TABLE_TOP - 0.06, 0]}>
        <torusGeometry args={[0.93, 0.05, 10, 48]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
      {/* Plate */}
      <mesh position={[0, TABLE_TOP + 0.015, 0]}>
        <cylinderGeometry args={[0.62, 0.58, 0.03, 40]} />
        <meshStandardMaterial color="#F5C870" metalness={0.3} roughness={0.35} />
      </mesh>
      {/* Tier 1 */}
      <mesh position={[0, TABLE_TOP + TIER1_H / 2 + 0.03, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.5, 0.5, TIER1_H, 40]} />
        <meshStandardMaterial color={def.tiers[0]} roughness={0.6} />
      </mesh>
      <mesh position={[0, TABLE_TOP + TIER1_H + 0.02, 0]}>
        <torusGeometry args={[0.47, 0.045, 10, 40]} />
        <meshStandardMaterial color={def.frosting} roughness={0.4} />
      </mesh>
      {/* Tier 2 */}
      <mesh position={[0, TABLE_TOP + TIER1_H + TIER2_H / 2 + 0.03, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.34, 0.34, TIER2_H, 36]} />
        <meshStandardMaterial color={def.tiers[1] ?? def.tiers[0]} roughness={0.6} />
      </mesh>
      <mesh position={[0, TOP + 0.03, 0]}>
        <torusGeometry args={[0.31, 0.04, 10, 36]} />
        <meshStandardMaterial color={def.frosting} roughness={0.4} />
      </mesh>
      <Sprinkles />
      {Array.from({ length: def.candles }, (_, i) => {
        const a = (i / def.candles) * Math.PI * 2;
        return (
          <Candle
            key={i}
            position={[Math.cos(a) * 0.18, TOP + 0.03, Math.sin(a) * 0.18]}
            lit={candlesLit}
            seed={i}
            reducedMotion={reducedMotion}
          />
        );
      })}
      {candlesLit && (
        <pointLight position={[0, TOP + 0.45, 0]} color="#FFB45C" intensity={2.2} distance={4} decay={2} />
      )}
    </group>
  );
}

function Sprinkles() {
  const colors = ["#9178E8", "#F9A6BA", "#6BCBBE", "#F5C870"];
  return (
    <group>
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        const y = TABLE_TOP + 0.12 + (i % 3) * 0.07;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.505, y, Math.sin(a) * 0.505]} rotation={[0, -a, 0.6]}>
            <capsuleGeometry args={[0.012, 0.035, 2, 6]} />
            <meshStandardMaterial color={colors[i % colors.length]} />
          </mesh>
        );
      })}
    </group>
  );
}

function Candle({
  position,
  lit,
  seed,
  reducedMotion,
}: {
  position: [number, number, number];
  lit: boolean;
  seed: number;
  reducedMotion: boolean;
}) {
  const flame = useRef<THREE.Mesh>(null);
  const smoke = useRef<THREE.Mesh>(null);
  const smokeT = useRef(0);
  const wasLit = useRef(lit);

  useFrame((state, dt) => {
    if (wasLit.current && !lit) smokeT.current = 0.0001;
    wasLit.current = lit;
    if (flame.current) {
      flame.current.visible = lit;
      if (lit && !reducedMotion) {
        const t = state.clock.elapsedTime * 9 + seed * 1.7;
        flame.current.scale.set(1 + Math.sin(t) * 0.08, 1 + Math.sin(t * 1.3) * 0.15, 1);
      }
    }
    if (smoke.current) {
      if (smokeT.current > 0 && smokeT.current < 1.6) {
        smokeT.current += dt;
        const k = smokeT.current / 1.6;
        smoke.current.visible = true;
        smoke.current.position.y = 0.22 + k * 0.5;
        smoke.current.scale.setScalar(0.5 + k * 1.2);
        (smoke.current.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k);
      } else {
        smoke.current.visible = false;
      }
    }
  });

  const stripe = seed % 2 === 0 ? "#9178E8" : "#F9A6BA";
  return (
    <group position={position}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.16, 10]} />
        <meshStandardMaterial color={stripe} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.003, 0.003, 0.03, 4]} />
        <meshBasicMaterial color="#333" />
      </mesh>
      <mesh ref={flame} position={[0, 0.215, 0]}>
        <sphereGeometry args={[0.028, 10, 10]} />
        <meshBasicMaterial color="#FFC14D" toneMapped={false} />
      </mesh>
      <mesh ref={smoke} position={[0, 0.22, 0]} visible={false}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#d9d4e6" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
