"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { createLabelRegistry, Label, LabelLayer, type LabelRegistry } from "@/features/room-scene/labels";
import { cn } from "@happyroom/ui";
import { COUNTRIES } from "../countries";
import type { Cluster, PublicCelebration } from "../model";
import { MAX_DISTANCE, MIN_DISTANCE } from "./camera-rig";
import { limbFade, projectLatLng } from "./project";

export { createLabelRegistry, type LabelRegistry };

interface Candidate {
  code: string;
  lat: number;
  lng: number;
  /** This country's own Natural Earth label-priority rank (2 = major, 7 = tiny territory). */
  rank: number;
  /** Selected, or carrying a celebration: shown regardless of the current zoom-based rank gate. */
  bypassRank: boolean;
  /** Ascending sort key: more important countries come first. */
  score: number;
}

/**
 * Priority order for this frame: the selected country first, then countries with a live or
 * upcoming celebration, then everyone else by Natural Earth's own label-priority rank (the
 * closest proxy available to "large on screen" without per-country polygon area data).
 */
export function buildCandidates(
  celebrations: readonly PublicCelebration[],
  selectedCountry: string,
): Candidate[] {
  const party = new Map<string, { any: boolean; live: boolean }>();
  for (const c of celebrations) {
    const p = party.get(c.countryCode) ?? { any: false, live: false };
    p.any = true;
    if (c.status === "live") p.live = true;
    party.set(c.countryCode, p);
  }
  return COUNTRIES.map((c): Candidate => {
    const p = party.get(c.code);
    const selected = c.code === selectedCountry;
    let score: number;
    if (selected) score = -1_000_000_000;
    else if (p?.live) score = -2_000_000 + c.labelRank;
    else if (p?.any) score = -1_000_000 + c.labelRank;
    else score = c.labelRank * 1000;
    return { code: c.code, lat: c.lat, lng: c.lng, rank: c.labelRank, bypassRank: selected || !!p, score };
  }).sort((a, b) => a.score - b.score);
}

/** How many labels fit: more as the camera moves in, fewer when zoomed out; mobile gets fewer still. */
export function labelBudget(cameraDistance: number, narrow: boolean): number {
  const t = THREE.MathUtils.clamp((MAX_DISTANCE - cameraDistance) / (MAX_DISTANCE - MIN_DISTANCE), 0, 1);
  const n = Math.round(THREE.MathUtils.lerp(12, 70, t));
  return narrow ? Math.round(n * 0.55) : n;
}

/** Below this rank, a country only appears once zoomed in enough (selected/party countries bypass it). */
export function maxRankForDistance(cameraDistance: number): number {
  const t = THREE.MathUtils.clamp((MAX_DISTANCE - cameraDistance) / (MAX_DISTANCE - MIN_DISTANCE), 0, 1);
  return Math.round(THREE.MathUtils.lerp(3, 7, t));
}

const COLLISION_PAD = 4;
const FALLBACK_W = 64;
const FALLBACK_H = 20;
/** Labels float above their point, like a map pin caption, so they never sit on a party marker. */
const LABEL_LIFT_PX = 16;
/** Generous fixed clearance kept around every visible party marker, regardless of its zoom size. */
const MARKER_CLEARANCE_PX = 26;

/**
 * Inside the <Canvas>: every ~4th frame, decides which country names currently fit on screen
 * (front-facing, budgeted by zoom, greedily de-overlapped using each label's own measured DOM
 * size) and writes their position/opacity straight onto the DOM nodes mounted by
 * `CountryLabelsOverlay` — no React state, no per-frame re-render, matching LabelAnchor's pattern.
 */
export function CountryLabelsDriver({
  celebrations,
  clusters,
  selectedCountry,
  registry,
  enabled,
  narrow,
}: {
  celebrations: readonly PublicCelebration[];
  /** Current marker clusters, so labels route around them instead of covering a clickable marker. */
  clusters: readonly Cluster[];
  selectedCountry: string;
  registry: LabelRegistry;
  enabled: boolean;
  narrow: boolean;
}) {
  const candidates = useMemo(
    () => buildCandidates(celebrations, selectedCountry),
    [celebrations, selectedCountry],
  );
  const scratch = useRef(new THREE.Vector3());
  const frameCount = useRef(0);
  const placed = useRef<Set<string>>(new Set());

  // Disabling the toggle hides everything immediately rather than waiting for the next tick.
  useEffect(() => {
    if (enabled) return;
    for (const code of placed.current) registry.get(code)?.style.setProperty("opacity", "0");
    placed.current.clear();
  }, [enabled, registry]);

  useFrame((state) => {
    if (!enabled) return;
    frameCount.current++;
    if (frameCount.current % 4 !== 0) return; // throttle: ~15 Hz, not every frame

    const distance = state.camera.position.length();
    const budget = labelBudget(distance, narrow);
    const maxRank = maxRankForDistance(distance);
    const boxes: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const next = new Set<string>();

    // Reserve space around every visible party marker first: labels are placed around these
    // boxes, never on top of them, so a marker underneath a label stays clickable and unobscured.
    for (const cluster of clusters) {
      const p = projectLatLng(cluster.lat, cluster.lng, state.camera, state.size, scratch.current);
      if (!p) continue;
      boxes.push({
        x1: p.x - MARKER_CLEARANCE_PX,
        y1: p.y - MARKER_CLEARANCE_PX,
        x2: p.x + MARKER_CLEARANCE_PX,
        y2: p.y + MARKER_CLEARANCE_PX,
      });
    }

    for (const cand of candidates) {
      if (next.size >= budget) break;
      if (!cand.bypassRank && cand.rank > maxRank) continue;
      const el = registry.get(cand.code);
      if (!el) continue;
      const p = projectLatLng(cand.lat, cand.lng, state.camera, state.size, scratch.current);
      if (!p) continue;
      const w = (el.offsetWidth || FALLBACK_W) + COLLISION_PAD * 2;
      const h = (el.offsetHeight || FALLBACK_H) + COLLISION_PAD * 2;
      // The label floats above its point (bottom edge lifted clear of it), like a pin caption.
      const cy = p.y - LABEL_LIFT_PX - h / 2;
      const box = { x1: p.x - w / 2, y1: cy - h / 2, x2: p.x + w / 2, y2: cy + h / 2 };
      // The selected country is always shown once it's on the visible face (it is processed
      // first, so the only boxes that could block it are marker-clearance reservations, which it
      // is allowed to override — seeing the name you picked matters more than that one gap).
      const isSelected = cand.code === selectedCountry;
      const overlaps =
        !isSelected && boxes.some((b) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
      if (overlaps) continue;
      boxes.push(box);
      next.add(cand.code);
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${(p.y - LABEL_LIFT_PX).toFixed(1)}px, 0) translate(-50%, -100%)`;
      el.style.opacity = String(limbFade(p.facing));
    }
    for (const code of placed.current) {
      if (!next.has(code)) registry.get(code)?.style.setProperty("opacity", "0");
    }
    placed.current = next;
  });

  return null;
}

/**
 * Outside the <Canvas>: one hidden DOM node per country (cheap — opacity-only, never
 * `display:none`, so the driver can read real measured sizes for collision even before a label
 * is first shown). The selected country is cyan; every label is a real, if untabbable, button —
 * the country filter dropdown remains the keyboard-equivalent way to do the same thing.
 */
export function CountryLabelsOverlay({
  registry,
  selectedCountry,
  countryName,
  onSelect,
}: {
  registry: LabelRegistry;
  selectedCountry: string;
  countryName: (code: string) => string;
  onSelect: (code: string) => void;
}) {
  return (
    <LabelLayer>
      {COUNTRIES.map((c) => (
        <Label key={c.code} id={c.code} registry={registry}>
          <CountryLabelButton
            code={c.code}
            name={countryName(c.code)}
            selected={c.code === selectedCountry}
            onSelect={onSelect}
          />
        </Label>
      ))}
    </LabelLayer>
  );
}

function CountryLabelButton({
  code,
  name,
  selected,
  onSelect,
}: {
  code: string;
  name: string;
  selected: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => onSelect(code)}
      data-testid="country-label"
      data-country={code}
      className={cn(
        "pointer-events-auto cursor-pointer whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-bold tracking-wide",
        "[text-shadow:0_1px_3px_rgb(0_0_0/0.9),0_0_6px_rgb(0_0_0/0.7)] transition-[color,transform] duration-150",
        "hover:scale-110 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan",
        selected ? "scale-110 text-cyan-300" : "text-slate-200",
      )}
    >
      {name}
    </button>
  );
}
