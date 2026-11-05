"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { Terrain, ZoneDefinition } from "@happyroom/world";
import { assetManager } from "../engine/asset-manager";
import { ZoneObjectView } from "./object-library";

export const ENVIRONMENT_PRESETS = {
  plaza_day: { sky: "#CDEBFF", fog: "#E9F6FF", sun: "#FFF4D6", ambient: "#FFE9F1", hemiGround: "#BFE7DD" },
  garden_golden_hour: {
    sky: "#FFE3C2",
    fog: "#FFEFD9",
    sun: "#FFD49A",
    ambient: "#FFE0EA",
    hemiGround: "#D9EFC7",
  },
  night_festival: {
    sky: "#2A2F55",
    fog: "#3A3570",
    sun: "#B9A9FF",
    ambient: "#9178E8",
    hemiGround: "#3A3570",
  },
} as const;

const TERRAIN_COLORS: Record<Terrain["material"], string> = {
  grass: "#A8DDA8",
  path: "#EADBC8",
  plaza_stone: "#F1ECF9",
  water: "#8EC5FF",
  sand: "#F3E3BD",
  wood_deck: "#D9B48C",
  flower_soil: "#8A6A55",
};

/** Draw order: later terrain sits slightly higher so overlaps never z-fight. */
function TerrainPiece({ t, i }: { t: Terrain; i: number }) {
  const y = 0.002 + i * 0.002;
  const color = TERRAIN_COLORS[t.material];
  if (t.shape.kind === "circle") {
    return (
      <mesh
        name={t.id}
        position={[t.shape.center[0], y, t.shape.center[1]]}
        rotation-x={-Math.PI / 2}
        receiveShadow
      >
        <circleGeometry args={[t.shape.radius, 48]} />
        <meshStandardMaterial color={color} roughness={t.material === "water" ? 0.1 : 0.95} />
      </mesh>
    );
  }
  const r = t.shape.rect;
  return (
    <mesh
      name={t.id}
      position={[(r.minX + r.maxX) / 2, y, (r.minZ + r.maxZ) / 2]}
      rotation-x={-Math.PI / 2}
      receiveShadow
    >
      <planeGeometry args={[r.maxX - r.minX, r.maxZ - r.minZ]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

/**
 * Renders a zone from data: environment lighting, terrain, objects (procedural or GLB), and an
 * optional whole-zone environment GLB authored in Blender (zone.assets.environment).
 */
export function ZoneEnvironment({ zone, quality }: { zone: ZoneDefinition; quality: "high" | "low" }) {
  const env = ENVIRONMENT_PRESETS[zone.environmentPreset];
  const shadows = quality === "high";
  return (
    <>
      <color attach="background" args={[env.sky]} />
      <fog attach="fog" args={[env.fog, 30, 70]} />
      <hemisphereLight args={[env.ambient, env.hemiGround, 1.4]} />
      <directionalLight
        position={[12, 18, 10]}
        intensity={1.6}
        color={env.sun}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />
      {/* Surrounding land beyond the zone edge, so the horizon never shows empty sky below it. */}
      <mesh position={[0, -0.02, 0]} rotation-x={-Math.PI / 2} receiveShadow={false}>
        <planeGeometry args={[240, 240]} />
        <meshStandardMaterial color={env.hemiGround} roughness={1} />
      </mesh>
      {zone.assets.environment ? (
        <GlbEnvironment
          url={zone.assets.environment}
          fallback={<ProceduralZone zone={zone} quality={quality} />}
        />
      ) : (
        <ProceduralZone zone={zone} quality={quality} />
      )}
    </>
  );
}

function ProceduralZone({ zone, quality }: { zone: ZoneDefinition; quality: "high" | "low" }) {
  return (
    <group name={`zone:${zone.zoneId}`}>
      {zone.terrain.map((t, i) => (
        <TerrainPiece key={t.id} t={t} i={i} />
      ))}
      {zone.objects.map((o) => (
        <ZoneObjectView key={o.id} object={o} quality={quality} />
      ))}
    </group>
  );
}

/** Whole-zone Blender environment with procedural fallback while missing/loading. Released on unmount. */
function GlbEnvironment({ url, fallback }: { url: string; fallback: React.ReactNode }) {
  const [scene, setScene] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let alive = true;
    void assetManager.exists(url).then((ok) => {
      if (!ok || !alive) return;
      void assetManager.acquire(url).then((g) => alive && setScene(g.scene));
    });
    return () => {
      alive = false;
      assetManager.release(url);
    };
  }, [url]);
  return scene ? <primitive object={scene} /> : <>{fallback}</>;
}
