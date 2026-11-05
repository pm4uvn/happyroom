"use client";

import { useEffect, useMemo, useState } from "react";
import { assetManager } from "../engine/asset-manager";
import * as THREE from "three";
import type { ZoneObject } from "@happyroom/world";

/**
 * Procedural stand-ins for zone object types. Clearly temporary, stylised geometry: each is
 * replaceable by a Blender GLB (zone object `asset`) without touching gameplay, because
 * gameplay only uses the stable object `id`, its position and its collider data.
 */
type Builder = (o: ZoneObject, q: "high" | "low") => React.ReactElement;

const mat = (color: string, roughness = 0.8, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => (
  <meshStandardMaterial color={color} roughness={roughness} {...extra} />
);

const Tree: Builder = (_o, q) => (
  <group>
    <mesh position={[0, 1.1, 0]} castShadow>
      <cylinderGeometry args={[0.18, 0.28, 2.2, 8]} />
      {mat("#9A6B4F")}
    </mesh>
    {[
      [0, 2.9, 0, 1.5],
      [0.7, 2.5, 0.3, 1.0],
      [-0.6, 2.6, -0.3, 1.05],
    ].map(([x, y, z, r], i) => (
      <mesh key={i} position={[x!, y!, z!]} castShadow>
        <sphereGeometry args={[r!, q === "high" ? 16 : 10, q === "high" ? 12 : 8]} />
        {mat(i === 0 ? "#7CC48F" : "#6BB884")}
      </mesh>
    ))}
  </group>
);

const Pine: Builder = () => (
  <group>
    <mesh position={[0, 0.6, 0]}>
      <cylinderGeometry args={[0.15, 0.22, 1.2, 8]} />
      {mat("#8A5A44")}
    </mesh>
    {[0, 1, 2].map((i) => (
      <mesh key={i} position={[0, 1.6 + i * 0.85, 0]} castShadow>
        <coneGeometry args={[1.4 - i * 0.35, 1.6, 10]} />
        {mat(i % 2 ? "#4FA77A" : "#5CB389")}
      </mesh>
    ))}
  </group>
);

const Bench: Builder = () => (
  <group>
    <mesh position={[0, 0.45, 0]} castShadow>
      <boxGeometry args={[1.8, 0.08, 0.5]} />
      {mat("#C98F5A")}
    </mesh>
    <mesh position={[0, 0.8, -0.24]} castShadow>
      <boxGeometry args={[1.8, 0.5, 0.06]} />
      {mat("#C98F5A")}
    </mesh>
    {[-0.75, 0.75].map((x) => (
      <mesh key={x} position={[x, 0.22, 0]}>
        <boxGeometry args={[0.08, 0.44, 0.45]} />
        {mat("#46506a", 0.4, { metalness: 0.5 })}
      </mesh>
    ))}
  </group>
);

const Flowerbed: Builder = (o) => {
  const colors = (o.props.colors as string[] | undefined) ?? ["#F9A6BA", "#F5C870"];
  return (
    <group>
      <mesh position={[0, 0.18, 0]} receiveShadow>
        <boxGeometry args={[2.6, 0.36, 1.2]} />
        {mat("#E8D7C3")}
      </mesh>
      <mesh position={[0, 0.37, 0]}>
        <boxGeometry args={[2.4, 0.04, 1.0]} />
        {mat("#7A5A45", 1)}
      </mesh>
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[-1.05 + (i % 7) * 0.35, 0.48, i < 7 ? -0.25 : 0.25]}>
          <sphereGeometry args={[0.11, 8, 6]} />
          {mat(colors[i % colors.length]!, 0.6)}
        </mesh>
      ))}
    </group>
  );
};

const StreetLamp: Builder = () => (
  <group>
    <mesh position={[0, 1.6, 0]}>
      <cylinderGeometry args={[0.06, 0.09, 3.2, 8]} />
      {mat("#46506a", 0.4, { metalness: 0.6 })}
    </mesh>
    <mesh position={[0, 3.3, 0]}>
      <sphereGeometry args={[0.24, 12, 10]} />
      <meshStandardMaterial color="#FFF4D6" emissive="#FFE7A3" emissiveIntensity={0.8} />
    </mesh>
  </group>
);

const Fountain: Builder = (_o, q) => (
  <group>
    <mesh position={[0, 0.3, 0]} receiveShadow>
      <cylinderGeometry args={[2.6, 2.75, 0.6, q === "high" ? 40 : 24]} />
      {mat("#E9E3FF", 0.6)}
    </mesh>
    <mesh position={[0, 0.55, 0]}>
      <cylinderGeometry args={[2.25, 2.25, 0.05, q === "high" ? 40 : 24]} />
      <meshStandardMaterial color="#8EC5FF" roughness={0.1} metalness={0.1} transparent opacity={0.85} />
    </mesh>
    <mesh position={[0, 1.1, 0]}>
      <cylinderGeometry args={[0.35, 0.5, 1.1, 16]} />
      {mat("#D3C8FB", 0.5)}
    </mesh>
    <mesh position={[0, 1.75, 0]}>
      <cylinderGeometry args={[0.9, 0.7, 0.2, 24]} />
      {mat("#E9E3FF", 0.5)}
    </mesh>
    <mesh position={[0, 2.2, 0]}>
      <sphereGeometry args={[0.35, 16, 12]} />
      <meshStandardMaterial color="#BFE7FF" transparent opacity={0.7} roughness={0.05} />
    </mesh>
  </group>
);

const Signpost: Builder = (o) => (
  <group>
    <mesh position={[0, 0.9, 0]}>
      <cylinderGeometry args={[0.06, 0.06, 1.8, 8]} />
      {mat("#9A6B4F")}
    </mesh>
    <mesh position={[0, 1.55, 0.05]} castShadow>
      <boxGeometry args={[1.1, 0.4, 0.06]} />
      {mat(o.id.includes("garden") ? "#6BCBBE" : "#F9A6BA", 0.6)}
    </mesh>
    <mesh position={[0.62, 1.55, 0.05]} rotation-z={-Math.PI / 2}>
      <coneGeometry args={[0.2, 0.18, 3]} />
      {mat(o.id.includes("garden") ? "#6BCBBE" : "#F9A6BA", 0.6)}
    </mesh>
  </group>
);

/** The Birthday House exterior (10 m × 6 m footprint), door facing +Z towards the plaza. */
const BirthdayHouse: Builder = () => (
  <group>
    <mesh position={[0, 1.9, 0]} castShadow receiveShadow>
      <boxGeometry args={[10, 3.8, 6]} />
      {mat("#FFE6ED", 0.85)}
    </mesh>
    {/* Roof */}
    <mesh position={[0, 4.6, 0]} rotation-y={Math.PI / 4} castShadow>
      <coneGeometry args={[6.4, 2.2, 4]} />
      {mat("#9178E8", 0.7)}
    </mesh>
    {/* Door + frame */}
    <mesh position={[0, 1.15, 3.02]}>
      <boxGeometry args={[1.8, 2.3, 0.06]} />
      {mat("#F5C870", 0.5)}
    </mesh>
    <mesh position={[0, 1.15, 3.06]}>
      <boxGeometry args={[1.5, 2.05, 0.04]} />
      {mat("#B5862A", 0.5)}
    </mesh>
    {/* Windows */}
    {[-3.2, 3.2].map((x) => (
      <mesh key={x} position={[x, 2.1, 3.02]}>
        <boxGeometry args={[1.6, 1.2, 0.05]} />
        <meshStandardMaterial color="#FFF4D6" emissive="#FFE7A3" emissiveIntensity={0.35} />
      </mesh>
    ))}
    {/* Sign: big cake badge */}
    <mesh position={[0, 3.35, 3.05]}>
      <cylinderGeometry args={[0.6, 0.6, 0.08, 24]} />
      {mat("#F9A6BA", 0.5)}
    </mesh>
    {/* Balloons at the door */}
    {[
      [-1.4, "#9178E8"],
      [1.4, "#6BCBBE"],
      [-1.7, "#F5C870"],
      [1.7, "#F9A6BA"],
    ].map(([x, c], i) => (
      <group key={i} position={[x as number, 0, 3.4]}>
        <mesh position={[0, 2.6 + (i % 2) * 0.3, 0]}>
          <sphereGeometry args={[0.32, 16, 12]} />
          {mat(c as string, 0.25)}
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 2.4, 4]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    ))}
    {/* Welcome mat */}
    <mesh position={[0, 0.02, 3.8]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[2.4, 1.2]} />
      {mat("#F5C870", 1)}
    </mesh>
  </group>
);

const Hedge: Builder = () => (
  <mesh position={[0, 0.6, 0]} castShadow>
    <boxGeometry args={[1, 1.2, 1]} />
    {mat("#5CB389", 0.95)}
  </mesh>
);

const Gazebo: Builder = () => (
  <group>
    <mesh position={[0, 0.1, 0]}>
      <cylinderGeometry args={[3, 3, 0.2, 8]} />
      {mat("#E8CFA6")}
    </mesh>
    {Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return (
        <mesh key={i} position={[Math.cos(a) * 2.7, 1.4, Math.sin(a) * 2.7]}>
          <cylinderGeometry args={[0.08, 0.08, 2.6, 8]} />
          {mat("#FFFFFF")}
        </mesh>
      );
    })}
    <mesh position={[0, 3.2, 0]}>
      <coneGeometry args={[3.4, 1.4, 8]} />
      {mat("#F9A6BA", 0.7)}
    </mesh>
    <mesh position={[0, 0.7, 0]}>
      <cylinderGeometry args={[0.5, 0.5, 0.9, 16]} />
      {mat("#FFFFFF")}
    </mesh>
  </group>
);

const Arch: Builder = (o) => (
  <group>
    {[-1.4, 1.4].map((x) => (
      <mesh key={x} position={[x, 1.4, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 2.8, 10]} />
        {mat("#FFFFFF")}
      </mesh>
    ))}
    <mesh position={[0, 2.8, 0]}>
      <torusGeometry args={[1.4, 0.12, 10, 24, Math.PI]} />
      {mat((o.props.color as string) ?? "#9178E8", 0.6)}
    </mesh>
  </group>
);

const Rock: Builder = () => (
  <mesh position={[0, 0.35, 0]} scale={[1, 0.6, 0.8]} castShadow>
    <dodecahedronGeometry args={[0.7, 0]} />
    {mat("#B8B4C8", 1)}
  </mesh>
);

const Planter: Builder = () => (
  <group>
    <mesh position={[0, 0.3, 0]}>
      <cylinderGeometry args={[0.45, 0.35, 0.6, 12]} />
      {mat("#F5C870")}
    </mesh>
    <mesh position={[0, 0.85, 0]}>
      <sphereGeometry args={[0.5, 12, 10]} />
      {mat("#6BCBBE")}
    </mesh>
  </group>
);

/** Marks land reserved for future expansion (non-solid, visible "coming soon" plinth). */
const ExpansionMarker: Builder = () => (
  <group>
    <mesh position={[0, 0.05, 0]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[1.8, 2, 32]} />
      <meshBasicMaterial color="#9178E8" transparent opacity={0.6} />
    </mesh>
    <mesh position={[0, 0.9, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 1.8, 6]} />
      {mat("#46506a")}
    </mesh>
    <mesh position={[0, 1.8, 0]}>
      <boxGeometry args={[1.2, 0.6, 0.06]} />
      <meshStandardMaterial color="#FAF8FF" emissive="#D3C8FB" emissiveIntensity={0.3} />
    </mesh>
  </group>
);

export const OBJECT_LIBRARY: Record<ZoneObject["type"], Builder> = {
  tree: Tree,
  pine: Pine,
  bench: Bench,
  flowerbed: Flowerbed,
  street_lamp: StreetLamp,
  fountain: Fountain,
  signpost: Signpost,
  birthday_house: BirthdayHouse,
  hedge: Hedge,
  planter: Planter,
  gazebo: Gazebo,
  arch: Arch,
  rock: Rock,
  expansion_marker: ExpansionMarker,
};

/** One placed zone object: a group named with the object's stable id (for GLB replacement + tests). */
export function ZoneObjectView({ object, quality }: { object: ZoneObject; quality: "high" | "low" }) {
  const build = OBJECT_LIBRARY[object.type];
  const hedgeScale = useMemo(() => {
    if (object.type !== "hedge" || object.collider?.kind !== "box") return null;
    return [object.collider.width, 1, object.collider.depth] as [number, number, number];
  }, [object]);
  return (
    <group
      name={object.id}
      userData={{ zoneObjectId: object.id, occluder: object.occludesCamera }}
      position={object.position}
      rotation-y={(object.rotationY * Math.PI) / 180}
      scale={hedgeScale ?? object.scale}
    >
      {object.asset ? (
        <AssetOrFallback asset={object.asset} fallback={build(object, quality)} />
      ) : (
        build(object, quality)
      )}
    </group>
  );
}

/**
 * Blender replacement for one object: loads the GLB (optionally a single named node) through the
 * AssetManager; the procedural stand-in stays visible while loading or if the file is missing.
 */
function AssetOrFallback({
  asset,
  fallback,
}: {
  asset: { url: string; node?: string };
  fallback: React.ReactElement;
}) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let alive = true;
    void assetManager.exists(asset.url).then((ok) => {
      if (!ok || !alive) return;
      void assetManager.acquire(asset.url).then((g) => {
        if (!alive) return;
        const source = asset.node ? g.scene.getObjectByName(asset.node) : g.scene;
        if (source) setObj(source.clone(true));
      });
    });
    return () => {
      alive = false;
      assetManager.release(asset.url);
    };
  }, [asset.url, asset.node]);
  return obj ? <primitive object={obj} /> : fallback;
}
