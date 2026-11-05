"use client";

import { useEffect, useMemo, useState } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  analyzeRoomAsset,
  ROOM_ASSET_TRANSFORM,
  ROOM_ASSET_URL,
  roomAssetAvailable,
  setFlamesVisible,
  type RoomAssetAnalysis,
} from "./room-asset";

/**
 * Renders the authored Blender room exactly as exported (geometry, materials, node names).
 * Gameplay hooks: candle flames are toggled by node name, and the cake gets an invisible,
 * accessible hit area at its analysed position.
 */
export function GltfRoom({
  candlesLit,
  shadows,
  onCakeActivate,
  onAnalyzed,
}: {
  candlesLit: boolean;
  shadows: boolean;
  onCakeActivate?: () => void;
  onAnalyzed?: (a: RoomAssetAnalysis) => void;
}) {
  // No Draco decoder is fetched from third-party CDNs; export with Meshopt or no compression.
  const gltf = useGLTF(ROOM_ASSET_URL, false, true);
  const scene = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = shadows;
        m.receiveShadow = shadows;
      }
    });
    return s;
  }, [gltf.scene, shadows]);
  const analysis = useMemo(() => analyzeRoomAsset(scene), [scene]);

  useEffect(() => {
    onAnalyzed?.(analysis);
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[HappyRoom] GLB layout analysis (copy into packages/shared/src/world.ts if it changed):",
        analysis,
      );
    }
  }, [analysis, onAnalyzed]);

  useEffect(() => setFlamesVisible(scene, candlesLit), [scene, candlesLit]);

  const cake = analysis.interactables.cake;
  return (
    <group
      position={ROOM_ASSET_TRANSFORM.position}
      rotation-y={ROOM_ASSET_TRANSFORM.rotationY}
      scale={ROOM_ASSET_TRANSFORM.scale}
    >
      <primitive object={scene} />
      {cake && onCakeActivate && (
        <mesh
          position={[cake.x, 1, cake.z]}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onCakeActivate();
          }}
          onPointerOver={() => (document.body.style.cursor = "pointer")}
          onPointerOut={() => (document.body.style.cursor = "")}
        >
          <cylinderGeometry args={[0.8, 0.8, 2, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** "unknown" while checking, then whether the GLB file is present on the server. */
export function useRoomAsset(mode: "auto" | "procedural"): "unknown" | "glb" | "procedural" {
  const [state, setState] = useState<"unknown" | "glb" | "procedural">(
    mode === "procedural" ? "procedural" : "unknown",
  );
  useEffect(() => {
    if (mode === "procedural") return;
    let alive = true;
    void roomAssetAvailable().then((ok) => alive && setState(ok ? "glb" : "procedural"));
    return () => {
      alive = false;
    };
  }, [mode]);
  return state;
}
