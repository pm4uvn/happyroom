"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Flame, RotateCcw } from "lucide-react";
import { AVATAR_PRESET_IDS, EMOTES, EMOTE_IDS, THEME_IDS } from "@happyroom/shared";
import { Badge, Button, cn, Segmented } from "@happyroom/ui";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { detectQualityTier, probeGpu, type QualityTier } from "@/features/room-scene/capabilities";
import { SceneFallback } from "@/features/room-scene/scene-fallback";
import { usePreview } from "./preview-state";

// Three.js + R3F are only downloaded on the client, after first paint.
const LandingScene = dynamic(() => import("./landing-scene"), { ssr: false });

type Support = { webgl: boolean; quality: QualityTier; finePointer: boolean };

const noop = () => () => {};
let cachedSupport: Support | null = null;
function readSupport(): Support {
  if (cachedSupport) return cachedSupport;
  const gpu = probeGpu();
  cachedSupport = {
    webgl: gpu.webgl,
    quality: detectQualityTier(gpu),
    finePointer: window.matchMedia("(pointer: fine)").matches,
  };
  return cachedSupport;
}

export function LivePreview({ className }: { className?: string }) {
  const t = useTranslations();
  const { registerPreview, ...preview } = usePreview();
  const reducedMotion = useReducedMotion();
  const support = useSyncExternalStore<Support | null>(noop, readSupport, () => null);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  const labels = useMemo(
    () => ({
      scene: t("demo.label"),
      cake: t("scene.cake"),
      avatars: Object.fromEntries(AVATAR_PRESET_IDS.map((id) => [id, t(`avatars.${id}`)])),
    }),
    [t],
  );

  const showCanvas = support?.webgl === true;
  const hint =
    support && !support.webgl
      ? t("demo.fallbackBody")
      : reducedMotion
        ? t("demo.reducedMotion")
        : support?.finePointer
          ? t("demo.dragHint")
          : t("demo.stepCake");

  return (
    <div
      ref={registerPreview}
      tabIndex={-1}
      role="region"
      aria-label={t("demo.label")}
      data-testid="live-preview"
      data-scene-ready={ready ? "true" : "false"}
      className={cn(
        "relative isolate overflow-hidden rounded-[2rem] bg-dream-100 shadow-lift ring-1 ring-white/60 outline-none",
        "focus-visible:ring-4 focus-visible:ring-dream/40",
        className,
      )}
    >
      <div className="absolute inset-0">
        {(!showCanvas || !ready) && (
          <SceneFallback
            themeId={preview.themeId}
            candlesLit={preview.candlesLit}
            className="h-full w-full"
            title={support && !support.webgl ? t("demo.fallbackTitle") : undefined}
          />
        )}
        {showCanvas && (
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-700",
              ready ? "opacity-100" : "opacity-0",
            )}
          >
            <LandingScene
              themeId={preview.themeId}
              candlesLit={preview.candlesLit}
              confettiKey={preview.confettiKey}
              emote={preview.emote}
              celebrating={preview.celebrating}
              quality={support.quality}
              reducedMotion={reducedMotion}
              allowOrbit={support.finePointer}
              labels={labels}
              onCakeActivate={preview.blowCandles}
              onReady={onReady}
            />
          </div>
        )}
      </div>

      {/* Overlay controls: every scene interaction is also available as a regular, accessible button. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
        <Badge tone="neutral" className="pointer-events-auto bg-white/85 backdrop-blur">
          {t("common.localPreview")}
        </Badge>
        <Segmented
          className="pointer-events-auto bg-white/80 backdrop-blur"
          label={t("demo.theme")}
          value={preview.themeId}
          onChange={preview.setTheme}
          options={THEME_IDS.map((id) => ({ value: id, label: t(`themes.${id}.name`) }))}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 sm:p-4">
        <div aria-live="polite" className="flex justify-center">
          {!preview.candlesLit && (
            <p className="animate-pop-in rounded-full bg-white/90 px-4 py-1.5 text-sm font-bold text-ink shadow-soft">
              {t("demo.candlesOut")}
            </p>
          )}
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-white/85 p-2 shadow-soft backdrop-blur">
          <div role="group" aria-label={t("demo.emotes")} className="flex flex-wrap gap-0.5">
            {EMOTE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => preview.sendEmote(id)}
                aria-label={t(`emotes.${id}`)}
                title={t(`emotes.${id}`)}
                className="grid size-10 place-items-center rounded-full text-xl transition-transform hover:scale-110 hover:bg-dream-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35 active:scale-95"
              >
                <span aria-hidden>{EMOTES[id].icon}</span>
              </button>
            ))}
          </div>
          {preview.candlesLit ? (
            <Button size="sm" variant="party" onClick={preview.blowCandles}>
              <Flame aria-hidden /> {t("demo.tapCake")}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={preview.relight}>
              <RotateCcw aria-hidden /> {t("demo.relight")}
            </Button>
          )}
        </div>
        <p className="text-center text-xs font-semibold text-ink-soft [text-shadow:0_1px_0_rgb(255_255_255/0.8)]">
          {hint}
        </p>
      </div>
      {showCanvas && !ready && (
        <span className="sr-only" role="status">
          {t("demo.loading")}
        </span>
      )}
    </div>
  );
}
