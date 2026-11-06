"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import type { QualityTier } from "@/features/room-scene/capabilities";
import { clusterCelebrations, clusterThreshold, type Cluster, type PublicCelebration } from "../model";
import { CameraRig, type FocusTarget, type ZoomCommand } from "./camera-rig";
import { CountryLabelsDriver, type LabelRegistry } from "./country-labels";
import { Earth } from "./earth";
import { latLngToXYZ, loadGeo, type GeoData } from "./geo";
import { Markers, projectCluster } from "./markers";

export interface GlobeCanvasProps {
  celebrations: PublicCelebration[];
  selectedId: string | null;
  focus: FocusTarget | null;
  zoom: ZoomCommand | null;
  quality: QualityTier;
  reducedMotion: boolean;
  /** False while scrolled out of view or the tab is hidden: rendering stops completely. */
  active: boolean;
  initialDistance: number;
  tooltipRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  onHover: (cluster: Cluster | null) => void;
  onPick: (cluster: Cluster) => void;
  onReady: () => void;
  onGeoError: () => void;
  countryLabelsRegistry: LabelRegistry;
  showCountryLabels: boolean;
  selectedCountry: string;
  narrow: boolean;
}

/** Fixed opening view (never derived from the visitor's location). */
const START_VIEW = { lat: 18, lng: 40 };

export default function GlobeCanvas(props: GlobeCanvasProps) {
  const { quality, reducedMotion, active, initialDistance } = props;
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [dpr, setDpr] = useState<number>(() =>
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.5),
  );
  const { onReady, onGeoError } = props;

  useEffect(() => {
    let alive = true;
    loadGeo(quality === "high" ? "50m" : "110m")
      .then((g) => alive && setGeo(g))
      .catch(() => alive && onGeoError());
    return () => {
      alive = false;
    };
  }, [quality, onGeoError]);

  const frameloop = !active ? "never" : reducedMotion ? "demand" : "always";

  return (
    <Canvas
      data-globe-canvas=""
      frameloop={frameloop}
      dpr={dpr}
      camera={{
        fov: 38,
        near: 0.05,
        far: 50,
        position: latLngToXYZ(START_VIEW.lat, START_VIEW.lng, initialDistance),
      }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: quality === "high" ? "high-performance" : "low-power",
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color(0x000000), 0);
      }}
      style={{ touchAction: "none" }}
    >
      <PerformanceMonitor
        onDecline={() => setDpr((d) => Math.max(1, d - 0.5))}
        flipflops={2}
        onFallback={() => setDpr(1)}
      />
      <Earth geo={geo} textureSize={quality === "high" ? 4096 : 2048} />
      <GlobeContent {...props} geoReady={geo !== null} onReady={onReady} />
    </Canvas>
  );
}

function GlobeContent({
  celebrations,
  selectedId,
  focus,
  zoom,
  reducedMotion,
  initialDistance,
  tooltipRef,
  stageRef,
  onHover,
  onPick,
  onReady,
  geoReady,
  countryLabelsRegistry,
  showCountryLabels,
  selectedCountry,
  narrow,
}: GlobeCanvasProps & { geoReady: boolean }) {
  const [threshold, setThreshold] = useState(() => clusterThreshold(initialDistance));
  const [hovered, setHovered] = useState<Cluster | null>(null);
  const clusters = useMemo(() => clusterCelebrations(celebrations, threshold), [celebrations, threshold]);
  const frame = useRef({ count: 0, ready: false, scratch: new THREE.Vector3() });
  const webdriver = useMemo(() => typeof navigator !== "undefined" && navigator.webdriver, []);

  // A cluster that no longer exists (filters/zoom changed) cannot stay hovered.
  const hoveredCluster = hovered && clusters.find((c) => c.id === hovered.id) ? hovered : null;
  useEffect(() => {
    if (!hoveredCluster) onHover(null);
  }, [hoveredCluster, onHover]);

  const onDistance = useCallback((d: number) => {
    const next = Math.round(clusterThreshold(d) * 2) / 2;
    setThreshold((prev) => (prev === next ? prev : next));
  }, []);

  const handlers = useMemo(
    () => ({
      onHover: (c: Cluster | null) => {
        setHovered(c);
        onHover(c);
      },
      onPick,
    }),
    [onHover, onPick],
  );

  useFrame((state) => {
    const f = frame.current;
    f.count++;
    if (!f.ready) {
      if (geoReady && f.count > 2) {
        f.ready = true;
        onReady();
      } else {
        // On-demand rendering (reduced motion) only draws when asked: keep going until ready.
        state.invalidate();
      }
    }
    // Keep the hover preview glued to its marker.
    const tip = tooltipRef.current;
    if (tip && hoveredCluster) {
      const p = projectCluster(hoveredCluster, state.camera, state.size, f.scratch);
      if (p) {
        tip.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        tip.style.opacity = "1";
      } else tip.style.opacity = "0";
    }
    // Test hook (automation only): on-screen marker positions so E2E can click real markers.
    if (webdriver && stageRef.current && (f.count < 4 || f.count % 15 === 0)) {
      const visible = clusters
        .map((c) => {
          const p = projectCluster(c, state.camera, state.size, f.scratch);
          return p && { id: c.id, n: c.items.length, x: Math.round(p.x), y: Math.round(p.y) };
        })
        .filter(Boolean);
      stageRef.current.dataset.markers = JSON.stringify(visible);
    }
  });

  return (
    <>
      <CameraRig focus={focus} zoom={zoom} autoRotate reducedMotion={reducedMotion} onDistance={onDistance} />
      <Markers
        clusters={clusters}
        selectedId={selectedId}
        hoveredId={hoveredCluster?.id ?? null}
        reducedMotion={reducedMotion}
        handlers={handlers}
      />
      <CountryLabelsDriver
        celebrations={celebrations}
        clusters={clusters}
        selectedCountry={selectedCountry}
        registry={countryLabelsRegistry}
        enabled={showCountryLabels}
        narrow={narrow}
      />
    </>
  );
}
