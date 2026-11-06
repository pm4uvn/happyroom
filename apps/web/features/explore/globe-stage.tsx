"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Globe2, Loader2, Minus, MoveHorizontal, Plus, RotateCcw } from "lucide-react";
import { cn } from "@happyroom/ui";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { detectQualityTier, probeGpu, type QualityTier } from "@/features/room-scene/capabilities";
import type { FocusTarget, ZoomCommand } from "./globe/camera-rig";
import type { CelebrationLabels } from "./labels";
import type { Cluster, PublicCelebration } from "./model";

// three.js + R3F are downloaded only on the client, after the server-rendered page is usable.
const GlobeCanvas = dynamic(() => import("./globe/globe-canvas"), { ssr: false });

type Support = { webgl: boolean; quality: QualityTier; finePointer: boolean; narrow: boolean };
const noop = () => () => {};
let cachedSupport: Support | null = null;
function readSupport(): Support {
  if (!cachedSupport) {
    const gpu = probeGpu();
    cachedSupport = {
      webgl: gpu.webgl,
      quality: detectQualityTier(gpu),
      finePointer: window.matchMedia("(pointer: fine)").matches,
      narrow: window.innerWidth < 640,
    };
  }
  return cachedSupport;
}

/** Pauses rendering when the globe is scrolled away or the tab is hidden (battery, heat). */
function useActive(ref: React.RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  const visible = useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => document.visibilityState === "visible",
    () => true,
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e?.isIntersecting ?? true), { threshold: 0.02 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView && visible;
}

export function GlobeStage({
  celebrations,
  selectedId,
  focus,
  demo,
  labels,
  onPick,
  onReset,
  children,
}: {
  celebrations: PublicCelebration[];
  selectedId: string | null;
  focus: FocusTarget | null;
  demo: boolean;
  labels: CelebrationLabels;
  onPick: (cluster: Cluster) => void;
  onReset: () => void;
  /** Overlay (selected celebration details). */
  children?: React.ReactNode;
}) {
  const t = useTranslations("explore");
  const support = useSyncExternalStore<Support | null>(noop, readSupport, () => null);
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const active = useActive(stageRef);
  const [ready, setReady] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const [hovered, setHovered] = useState<Cluster | null>(null);
  const [zoom, setZoom] = useState<ZoomCommand | null>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onGeoError = useCallback(() => setGeoError(true), []);
  const onHover = useCallback((c: Cluster | null) => setHovered(c), []);

  const showCanvas = support?.webgl === true;
  const unsupported = support !== null && !support.webgl;

  return (
    <div
      ref={stageRef}
      className="relative isolate h-full min-h-[360px] overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_90%_at_50%_45%,#16205a_0%,#0b1130_45%,#070b1f_100%)] ring-1 ring-night-line"
      data-testid="globe-stage"
      data-globe-ready={ready ? "true" : "false"}
      data-globe-support={support ? (support.webgl ? "webgl" : "none") : "pending"}
    >
      <Starfield />

      {showCanvas && (
        <div className="absolute inset-0" role="img" aria-label={t("globe.label")}>
          <GlobeCanvas
            celebrations={celebrations}
            selectedId={selectedId}
            focus={focus}
            zoom={zoom}
            quality={support.quality}
            reducedMotion={reducedMotion}
            active={active}
            initialDistance={support.narrow ? 4.5 : 3.85}
            tooltipRef={tooltipRef}
            stageRef={stageRef}
            onHover={onHover}
            onPick={onPick}
            onReady={onReady}
            onGeoError={onGeoError}
          />
        </div>
      )}

      {/* Hover preview, positioned per frame by the canvas. */}
      <div
        ref={tooltipRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-0 z-10 transition-opacity duration-150",
          hovered ? "opacity-100" : "opacity-0",
        )}
      >
        {hovered && <HoverCard cluster={hovered} labels={labels} demo={demo} />}
      </div>

      {/* Loading */}
      {showCanvas && !ready && (
        <div className="absolute inset-0 z-10 grid place-items-center" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-4">
            <div className="relative size-40 rounded-full bg-[radial-gradient(circle_at_35%_30%,#2a3680,#0b1130_70%)] shadow-[0_0_80px_10px_rgb(95_141_255/0.25)] motion-safe:animate-pulse" />
            <p className="flex items-center gap-2 text-sm font-semibold text-night-muted">
              <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" /> {t("globe.loading")}
            </p>
          </div>
        </div>
      )}

      {/* No WebGL: the list next to the globe offers everything. */}
      {unsupported && (
        <div className="absolute inset-0 grid place-items-center p-6" data-testid="globe-fallback">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-white/8 ring-1 ring-white/15">
              <Globe2 aria-hidden className="size-8 text-cyan-300" />
            </span>
            <p className="mt-4 font-display text-xl font-extrabold text-white">{t("globe.fallbackTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-night-muted">{t("globe.fallbackBody")}</p>
          </div>
        </div>
      )}

      {/* Controls + hints */}
      {showCanvas && (
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
          <IconButton label={t("globe.zoomIn")} onClick={() => setZoom({ factor: 0.75, key: Date.now() })}>
            <Plus aria-hidden className="size-4" />
          </IconButton>
          <IconButton label={t("globe.zoomOut")} onClick={() => setZoom({ factor: 1.33, key: Date.now() })}>
            <Minus aria-hidden className="size-4" />
          </IconButton>
          <IconButton label={t("globe.reset")} onClick={onReset}>
            <RotateCcw aria-hidden className="size-4" />
          </IconButton>
        </div>
      )}
      {showCanvas && ready && (
        <p className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-[calc(100%-5rem)] items-center gap-1.5 text-xs font-semibold text-night-muted">
          <MoveHorizontal aria-hidden className="size-3.5" />
          {reducedMotion ? t("globe.reducedMotion") : t("globe.hint")}
        </p>
      )}
      {geoError && (
        <p role="status" className="absolute left-4 top-12 z-20 text-xs font-semibold text-amber">
          {t("globe.geoError")}
        </p>
      )}
      {demo && (
        <span className="absolute bottom-3 left-3 z-20 rounded-full bg-violet/20 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet/40">
          {t("mode.demo")}
        </span>
      )}
      <span className="pointer-events-none absolute bottom-3 right-4 z-0 hidden text-[0.65rem] text-night-muted/70 sm:block">
        {t("credit")}
      </span>

      {children && (
        <div className="absolute inset-x-3 bottom-3 z-30 sm:inset-x-auto sm:left-4 sm:w-[min(24rem,calc(100%-2rem))]">
          {children}
        </div>
      )}
    </div>
  );
}

function HoverCard({
  cluster,
  labels,
  demo,
}: {
  cluster: Cluster;
  labels: CelebrationLabels;
  demo: boolean;
}) {
  const t = useTranslations("explore");
  const first = cluster.items[0]!;
  const many = cluster.items.length > 1;
  return (
    <div className="-translate-x-1/2 -translate-y-[calc(100%+18px)] w-64 rounded-2xl bg-midnight-900/95 p-3.5 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
      {many ? (
        <>
          <p className="font-display text-base font-bold">
            {t("globe.cluster", { count: cluster.items.length })}
          </p>
          <p className="text-xs text-night-muted">{cluster.countryCodes.map(labels.country).join(" · ")}</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {cluster.items.slice(0, 3).map((c) => (
              <li key={c.id} className="truncate">
                {c.name}
              </li>
            ))}
          </ul>
          {cluster.items.length > 3 && (
            <p className="mt-1 text-xs text-cyan-300">
              {t("globe.more", { count: cluster.items.length - 3 })}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="font-display text-base font-bold leading-snug">{first.name}</p>
          <p className="mt-1 text-xs font-semibold text-night-muted">
            {labels.type(first.celebrationType)} · {labels.country(first.countryCode)} ·{" "}
            {labels.language(first.language)}
          </p>
          <p className="mt-1 text-xs font-semibold text-cyan-300">{labels.status(first)}</p>
          {first.participantCount !== null && (
            <p className="mt-1 text-xs text-night-muted">
              {t("detail.participants", { count: first.participantCount })}
            </p>
          )}
          {demo && (
            <p className="mt-1 text-[0.7rem] font-bold uppercase tracking-wider text-violet-300">
              {t("mode.demo")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-full bg-midnight-900/80 text-white ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-midnight-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
    >
      {children}
    </button>
  );
}

/** Static CSS stars (no animation, no canvas cost). */
function Starfield() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-70"
      style={{
        backgroundImage:
          "radial-gradient(1px 1px at 12% 18%, #fff8 50%, transparent), radial-gradient(1px 1px at 78% 12%, #fff6 50%, transparent), radial-gradient(1.5px 1.5px at 88% 64%, #8be8f499 50%, transparent), radial-gradient(1px 1px at 24% 82%, #fff5 50%, transparent), radial-gradient(1px 1px at 52% 8%, #fff7 50%, transparent), radial-gradient(1.5px 1.5px at 8% 56%, #c9b9ff88 50%, transparent), radial-gradient(1px 1px at 66% 90%, #fff5 50%, transparent), radial-gradient(1px 1px at 92% 34%, #fff6 50%, transparent), radial-gradient(1px 1px at 38% 30%, #fff3 50%, transparent), radial-gradient(1px 1px at 60% 44%, #fff2 50%, transparent)",
      }}
    />
  );
}
