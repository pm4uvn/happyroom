"use client";

import { Suspense, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { DECORATIONS, THEMES, type CakeStyle, type DecorationPreset, type ThemeId } from "@happyroom/shared";
import type { QualityTier } from "./capabilities";
import { RoomShell } from "./room-shell";
import { Cake } from "./cake";
import { Balloons } from "./balloons";
import { Confetti } from "./confetti";
import { Doorway, FairyLights, GiftTable, MemoryWall, PhotoBooth } from "./furniture";
import { GltfRoom, useRoomAsset } from "./glb/gltf-room";

export interface PartySceneProps {
  themeId: ThemeId;
  cakeStyle: CakeStyle;
  decoration: DecorationPreset;
  candlesLit: boolean;
  confettiKey: number;
  quality: QualityTier;
  reducedMotion: boolean;
  /** Allow orbiting with a mouse/trackpad. Touch orbit is off so the page still scrolls on phones. */
  allowOrbit: boolean;
  cakeLabel: string;
  onCakeActivate?: () => void;
  /** Avatars and other dynamic content. */
  children?: ReactNode;
  ariaLabel: string;
  /**
   * Receives a capture function once WebGL is ready. Capturing renders one fresh frame and reads it
   * back in the same task, so we never need `preserveDrawingBuffer` (which slows every frame).
   */
  onCaptureReady?: (capture: () => HTMLCanvasElement) => void;
  /**
   * "auto": use the authored Blender room (public/assets/rooms/HappyRoom_BirthdayStudio_V2.glb)
   * when that file exists, otherwise the procedural room. Default "procedural" (landing preview).
   */
  roomAsset?: "auto" | "procedural";
}

const CAMERA_POSITION: [number, number, number] = [9.5, 8.2, 11.5];
const TARGET = new THREE.Vector3(-0.6, 0.9, -0.6);

/**
 * The birthday room. Shared by the landing preview and (from Milestone 3) live party rooms.
 * Performance budget: ~40 draw calls, no textures, no external models, one dynamic light.
 */
export function PartyScene(props: PartySceneProps) {
  const { quality, reducedMotion } = props;
  const [dpr, setDpr] = useState<number>(quality === "high" ? 1.75 : 1.25);
  const shadows = quality === "high";
  const palette = THEMES[props.themeId].palette;
  const asset = useRoomAsset(props.roomAsset ?? "procedural");

  return (
    <Canvas
      aria-label={props.ariaLabel}
      role="img"
      dpr={dpr}
      shadows={shadows}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{
        antialias: quality === "high",
        powerPreference: "high-performance",
        alpha: false,
      }}
      camera={{ position: CAMERA_POSITION, fov: 36, near: 0.1, far: 80 }}
      onCreated={({ camera, gl, scene }) => {
        camera.lookAt(TARGET);
        props.onCaptureReady?.(() => {
          gl.render(scene, camera);
          return gl.domElement;
        });
      }}
      style={{ touchAction: "pan-y" }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr(1)}
        onIncline={() => setDpr(quality === "high" ? 1.75 : 1.25)}
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.fog, 22, 48]} />
      <hemisphereLight args={[palette.light, palette.floor, 1.6]} />
      <ambientLight color={palette.ambient} intensity={0.35} />
      <directionalLight
        position={[6, 10, 6]}
        intensity={1.5}
        color={palette.light}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
      />
      <Suspense fallback={null}>
        {asset === "glb" ? (
          <GltfRoom candlesLit={props.candlesLit} shadows={shadows} onCakeActivate={props.onCakeActivate} />
        ) : asset === "procedural" ? (
          <>
            <RoomShell palette={palette} shadows={shadows} />
            <MemoryWall palette={palette} />
            <GiftTable palette={palette} shadows={shadows} />
            <PhotoBooth palette={palette} shadows={shadows} />
            <Doorway palette={palette} />
            {props.decoration === "fairy_lights" || props.themeId === "cozy_twilight" ? (
              <FairyLights reducedMotion={reducedMotion} />
            ) : null}
            <Balloons colors={DECORATIONS[props.decoration].colors} reducedMotion={reducedMotion} />
            <Cake
              style={props.cakeStyle}
              candlesLit={props.candlesLit}
              accent={palette.accent}
              shadows={shadows}
              reducedMotion={reducedMotion}
              label={props.cakeLabel}
              onActivate={props.onCakeActivate}
            />
          </>
        ) : null}
        {props.children}
        {!reducedMotion && (
          <Confetti burstKey={props.confettiKey} count={quality === "high" ? 180 : 70} origin={[0, 1.6, 0]} />
        )}
      </Suspense>
      {props.allowOrbit && (
        <OrbitControls
          target={TARGET}
          enablePan={false}
          enableZoom
          minDistance={10}
          maxDistance={21}
          minPolarAngle={0.55}
          maxPolarAngle={1.2}
          minAzimuthAngle={-0.15}
          maxAzimuthAngle={1.35}
          enableDamping={!reducedMotion}
          dampingFactor={0.08}
          rotateSpeed={0.6}
        />
      )}
    </Canvas>
  );
}
