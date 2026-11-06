"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Cluster } from "../model";
import { latLngToXYZ } from "./geo";
import { GLOBE_COLORS, TYPE_COLORS } from "./palette";
import { FACING_LIMIT, limbFade, projectLatLng } from "./project";

export interface MarkerHandlers {
  onHover: (cluster: Cluster | null) => void;
  onPick: (cluster: Cluster) => void;
}

export { FACING_LIMIT };

const Z = new THREE.Vector3(0, 0, 1);
const countTextures = new Map<number, THREE.CanvasTexture>();

function countTexture(n: number): THREE.CanvasTexture {
  let tex = countTextures.get(n);
  if (!tex) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#070b1f";
    ctx.font = "800 44px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n > 99 ? "99+" : String(n), 32, 35);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    countTextures.set(n, tex);
  }
  return tex;
}

function clusterColor(c: Cluster): string {
  const types = new Set(c.items.map((i) => i.celebrationType));
  return types.size === 1 ? TYPE_COLORS[c.items[0]!.celebrationType] : GLOBE_COLORS.cluster;
}

export function Markers({
  clusters,
  selectedId,
  hoveredId,
  reducedMotion,
  handlers,
}: {
  clusters: Cluster[];
  selectedId: string | null;
  hoveredId: string | null;
  reducedMotion: boolean;
  handlers: MarkerHandlers;
}) {
  return (
    <group>
      {clusters.map((c) => (
        <Marker
          key={c.id}
          cluster={c}
          selected={selectedId !== null && c.items.some((i) => i.id === selectedId)}
          hovered={hoveredId === c.id}
          reducedMotion={reducedMotion}
          handlers={handlers}
        />
      ))}
    </group>
  );
}

function Marker({
  cluster,
  selected,
  hovered,
  reducedMotion,
  handlers,
}: {
  cluster: Cluster;
  selected: boolean;
  hovered: boolean;
  reducedMotion: boolean;
  handlers: MarkerHandlers;
}) {
  const group = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const facing = useRef(true);
  const scratch = useRef({ world: new THREE.Vector3(), cam: new THREE.Vector3() });

  const { position, quaternion, normal } = useMemo(() => {
    const p = latLngToXYZ(cluster.lat, cluster.lng, 1.004);
    const n = new THREE.Vector3(...p).normalize();
    return {
      position: new THREE.Vector3(...p),
      quaternion: new THREE.Quaternion().setFromUnitVectors(Z, n),
      normal: n,
    };
  }, [cluster.lat, cluster.lng]);

  const count = cluster.items.length;
  const color = selected ? GLOBE_COLORS.selected : clusterColor(cluster);
  const live = cluster.items.some((i) => i.status === "live");
  const base = count > 1 ? 1.35 : 1;
  const emphasis = selected ? 1.35 : hovered ? 1.2 : 1;
  const label = useMemo(() => (count > 1 ? countTexture(count) : null), [count]);

  useEffect(() => {
    // Cursor feedback lives on the canvas element.
    if (!hovered) return;
    const el = document.querySelector<HTMLElement>("[data-globe-canvas] canvas");
    if (el) el.style.cursor = "pointer";
    return () => {
      if (el) el.style.cursor = "";
    };
  }, [hovered]);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const s = scratch.current;
    s.cam.copy(state.camera.position);
    const camDist = s.cam.length();
    const dot = s.cam.normalize().dot(normal);
    facing.current = dot > FACING_LIMIT;
    g.visible = dot > 0;
    // Constant-ish screen size: scale with distance from the camera.
    g.getWorldPosition(s.world);
    const d = s.world.distanceTo(state.camera.position);
    const k = d * 0.03 * base * emphasis * Math.min(1, 0.4 + camDist * 0.2);
    g.scale.setScalar(k);
    // Fade towards the limb.
    const fade = limbFade(dot);
    g.children.forEach((child) => {
      const mat = (child as THREE.Mesh).material as THREE.Material & {
        opacity: number;
        userData: { o?: number };
      };
      if (mat && "opacity" in mat && mat.userData.o !== undefined) mat.opacity = mat.userData.o * fade;
    });
    if (pulse.current) {
      const t = (state.clock.elapsedTime * 0.7 + (cluster.lat + cluster.lng) * 0.01) % 1;
      pulse.current.scale.setScalar(1 + t * 1.6);
      const m = pulse.current.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - t) * 0.55 * fade;
    }
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!facing.current) return;
    e.stopPropagation();
    handlers.onHover(cluster);
  };
  const out = () => handlers.onHover(null);
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!facing.current || e.delta > 8) return;
    e.stopPropagation();
    handlers.onPick(cluster);
  };

  return (
    <group ref={group} position={position} quaternion={quaternion}>
      {/* Generous invisible hit area for touch. */}
      <mesh onPointerOver={over} onPointerOut={out} onClick={click} position={[0, 0, 0.002]}>
        <circleGeometry args={[0.85, 20]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <ringGeometry args={[0.5, 0.66, 40]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          userData={{ o: 0.55 }}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <circleGeometry args={[count > 1 ? 0.42 : 0.3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={1} userData={{ o: 1 }} toneMapped={false} />
      </mesh>
      {label && (
        <mesh position={[0, 0, 0.008]}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial
            map={label}
            transparent
            opacity={1}
            userData={{ o: 1 }}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {live && !reducedMotion && (
        <mesh ref={pulse} position={[0, 0, 0.003]}>
          <ringGeometry args={[0.5, 0.58, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

/** Screen position (CSS px within the canvas) of a cluster, or null when it faces away. */
export function projectCluster(
  cluster: Cluster,
  camera: THREE.Camera,
  size: { width: number; height: number },
  scratch: THREE.Vector3,
): { x: number; y: number } | null {
  return projectLatLng(cluster.lat, cluster.lng, camera, size, scratch);
}
