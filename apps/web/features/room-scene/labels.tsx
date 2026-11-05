"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Screen-space labels (name tags, emote bubbles) for 3D objects.
 *
 * Why not drei <Html>? It creates one nested React root per label and unmounts it synchronously,
 * which races with React 19 rendering ("Attempted to synchronously unmount a root while React was
 * already rendering") and costs a root per avatar. Here, labels are ordinary DOM nodes rendered by
 * the page's React tree in an overlay next to the <Canvas>; an anchor inside the scene projects its
 * world position each frame and writes a CSS transform directly — no React work per frame.
 */
export type LabelRegistry = Map<string, HTMLElement>;

export function createLabelRegistry(): LabelRegistry {
  return new Map();
}

/** Inside the Canvas: marks the world position a label should follow. */
export function LabelAnchor({
  id,
  registry,
  position = [0, 0, 0],
}: {
  id: string;
  registry: LabelRegistry;
  position?: [number, number, number];
}) {
  const ref = useRef<THREE.Group>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  // In on-demand render mode (reduced motion) make sure at least one frame positions the label
  // after the DOM overlay has registered it.
  useEffect(() => {
    const t = window.setTimeout(() => invalidate(), 60);
    return () => window.clearTimeout(t);
  }, [invalidate]);

  useFrame(() => {
    const el = registry.get(id);
    const g = ref.current;
    if (!el || !g) return;
    v.setFromMatrixPosition(g.matrixWorld).project(camera);
    const visible = v.z > -1 && v.z < 1;
    const x = (v.x * 0.5 + 0.5) * size.width;
    const y = (-v.y * 0.5 + 0.5) * size.height;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    el.style.opacity = visible ? "1" : "0";
  });

  return <group ref={ref} position={position} />;
}

/** Outside the Canvas: the absolutely positioned overlay that holds all labels. */
export function LabelLayer({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {children}
    </div>
  );
}

/** One DOM label, registered under `id` so its anchor can position it. */
export function Label({
  id,
  registry,
  children,
}: {
  id: string;
  registry: LabelRegistry;
  children: ReactNode;
}) {
  return (
    <div
      ref={(el) => {
        if (el) registry.set(id, el);
        else registry.delete(id);
      }}
      className="absolute left-0 top-0 opacity-0 will-change-transform"
    >
      {children}
    </div>
  );
}

/** Standard avatar name tag + optional emote bubble. */
export function AvatarTag({ name, bubble }: { name?: string; bubble?: string | null }) {
  return (
    <div className="flex select-none flex-col items-center gap-1">
      {bubble && (
        <span className="animate-pop-in rounded-full bg-white px-2.5 py-1 text-xl shadow-soft">{bubble}</span>
      )}
      {name && (
        <span className="max-w-[9rem] truncate whitespace-nowrap rounded-full bg-ink/80 px-2.5 py-0.5 text-xs font-semibold text-white">
          {name}
        </span>
      )}
    </div>
  );
}
