"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Compass, Loader2, PartyPopper, RefreshCw, SearchX, Sparkles } from "lucide-react";
import { cn } from "@happyroom/ui";
import { ctaClass } from "./cta-class";
import { getCountry, REGION_FOCUS } from "./countries";
import { Filters } from "./filters";
import type { FocusTarget } from "./globe/camera-rig";
import { GlobeStage } from "./globe-stage";
import { useCelebrationLabels } from "./labels";
import {
  EMPTY_FILTERS,
  filterCelebrations,
  hasActiveFilters,
  sortCelebrations,
  type Cluster,
  type ExploreFilters,
  type PublicCelebration,
} from "./model";
import { ClusterPreview, RoomPreview } from "./room-preview";
import { RoomList } from "./room-list";
import { SummaryCards } from "./summary-cards";
import { useDiscovery } from "./use-discovery";
import { WishPanel } from "./wish-panel";

const NO_ITEMS: PublicCelebration[] = [];
const PAGE = 12;

/**
 * Explore dashboard: globe (lazy, optional) + an equivalent, keyboard-friendly list with search
 * and filters. Every action is reachable without the globe.
 */
export function Explorer({ demo }: { demo: boolean }) {
  const t = useTranslations("explore");
  const labels = useCelebrationLabels();
  const discovery = useDiscovery(demo);
  const [filters, setFilters] = useState<ExploreFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [wishTarget, setWishTarget] = useState<PublicCelebration | null>(null);
  const focusKey = useRef(0);

  const all = discovery.status === "ready" ? discovery.data.celebrations : NO_ITEMS;
  const mode = discovery.status === "ready" ? discovery.data.mode : demo ? "demo" : "live";
  const isDemo = mode === "demo";
  const visible = useMemo(
    () => sortCelebrations(filterCelebrations(all, filters, labels.country)),
    [all, filters, labels],
  );
  const selected = visible.find((c) => c.id === selectedId) ?? null;

  const flyTo = useCallback((lat: number, lng: number, distance?: number) => {
    focusKey.current += 1;
    setFocus({ lat, lng, distance, key: focusKey.current });
  }, []);

  const select = useCallback(
    (item: PublicCelebration) => {
      setSelectedId(item.id);
      setCluster(null);
      const c = getCountry(item.countryCode);
      if (c) flyTo(c.lat, c.lng, 2.35);
    },
    [flyTo],
  );

  const onPick = useCallback(
    (c: Cluster) => {
      if (c.items.length === 1) select(c.items[0]!);
      else {
        setSelectedId(null);
        setCluster(c);
        flyTo(c.lat, c.lng, 2.1);
      }
    },
    [select, flyTo],
  );

  const changeFilters = (next: ExploreFilters) => {
    if (next.country && next.country !== filters.country) {
      const c = getCountry(next.country);
      if (c) flyTo(c.lat, c.lng, 2.3);
    } else if (next.region && next.region !== filters.region) {
      const r = REGION_FOCUS[next.region];
      flyTo(r.lat, r.lng, 3.2);
    }
    setFilters(next);
    setCluster(null);
    setLimit(PAGE);
  };

  // Clicking a country's name label on the globe does exactly what picking it from the Country
  // dropdown does: sync the filter, fly the camera there, and the room list updates with it.
  const onSelectCountry = (code: string) => changeFilters({ ...filters, country: code });

  const close = useCallback(() => {
    setSelectedId(null);
    setCluster(null);
  }, []);

  useEffect(() => {
    if (!selected && !cluster) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, cluster, close]);

  const clusterVisible = cluster && cluster.items.filter((i) => visible.some((v) => v.id === i.id));
  const overlay = selected ? (
    <RoomPreview item={selected} demo={isDemo} labels={labels} onClose={close} onSendWish={setWishTarget} />
  ) : cluster && clusterVisible && clusterVisible.length > 0 ? (
    <ClusterPreview
      cluster={{ ...cluster, items: clusterVisible }}
      labels={labels}
      onSelect={select}
      onClose={close}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <SummaryCards demo={isDemo} />
      <div className="grid gap-4 lg:h-[clamp(560px,calc(100dvh-13rem),780px)] lg:grid-cols-[minmax(0,1.75fr)_minmax(340px,1fr)]">
        <div className="h-[min(72vh,460px)] sm:h-[520px] lg:h-full">
          <GlobeStage
            celebrations={visible}
            selectedId={selectedId}
            focus={focus}
            demo={isDemo}
            labels={labels}
            selectedCountry={filters.country}
            onPick={onPick}
            onSelectCountry={onSelectCountry}
            onReset={() => {
              close();
              flyTo(18, 40, 3.85);
            }}
          >
            {overlay}
          </GlobeStage>
          <p className="mt-1.5 text-right text-[0.65rem] text-night-muted/70 sm:hidden">{t("credit")}</p>
        </div>

        <aside
          aria-labelledby="explore-panel-title"
          className="flex min-h-0 flex-col rounded-[2rem] bg-midnight-900/80 p-4 ring-1 ring-night-line sm:p-5"
          data-testid="explore-panel"
          data-mode={mode}
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="explore-panel-title"
              className="flex items-center gap-2 font-display text-xl font-extrabold text-white"
            >
              <Compass aria-hidden className="size-5 text-cyan-300" /> {t("panel.title")}
            </h2>
            <ModeBadge demo={isDemo} />
          </div>

          {isDemo && (
            <p
              className="mt-3 flex gap-2 rounded-2xl bg-violet/12 p-3 text-xs leading-relaxed text-violet-300 ring-1 ring-violet/30"
              data-testid="demo-notice"
            >
              <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {t("mode.demoNotice")}{" "}
                <Link
                  href="/#explore"
                  className="font-bold text-white underline-offset-2 hover:underline"
                  scroll={false}
                >
                  {t("mode.exitDemo")}
                </Link>
              </span>
            </p>
          )}

          <div className="mt-4">
            <Filters value={filters} onChange={changeFilters} celebrations={all} />
          </div>

          <p
            className="mt-4 text-xs font-bold uppercase tracking-wider text-night-muted"
            aria-live="polite"
            data-testid="results-count"
          >
            {discovery.status === "ready" ? t("panel.results", { count: visible.length }) : " "}
          </p>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-color:var(--color-midnight-600)_transparent]">
            {discovery.status === "loading" && <LoadingList label={t("state.loading")} />}
            {discovery.status === "error" && (
              <StateCard
                icon={<AlertTriangle aria-hidden className="size-6 text-amber" />}
                title={t("state.errorTitle")}
                body={t("state.errorBody")}
                testId="explore-error"
              >
                <button type="button" onClick={discovery.retry} className={ctaClass("secondary")}>
                  <RefreshCw aria-hidden className="size-4" /> {t("state.retry")}
                </button>
              </StateCard>
            )}
            {discovery.status === "ready" && all.length === 0 && (
              <StateCard
                icon={<Compass aria-hidden className="size-6 text-cyan-300" />}
                title={t("state.emptyTitle")}
                body={t("state.emptyBody")}
                testId="explore-empty"
              >
                <Link href="/create" className={ctaClass("primary")}>
                  <PartyPopper aria-hidden className="size-4" /> {t("cta.create")}
                </Link>
                {discovery.data.demoAvailable && (
                  <Link
                    href="/?demo=1#explore"
                    scroll={false}
                    className={ctaClass("secondary")}
                    data-testid="try-demo"
                  >
                    <Sparkles aria-hidden className="size-4" /> {t("mode.tryDemo")}
                  </Link>
                )}
              </StateCard>
            )}
            {discovery.status === "ready" && all.length > 0 && visible.length === 0 && (
              <StateCard
                icon={<SearchX aria-hidden className="size-6 text-night-muted" />}
                title={t("state.noMatchTitle")}
                body={t("state.noMatchBody")}
                testId="explore-no-match"
              >
                {hasActiveFilters(filters) && (
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className={ctaClass("secondary")}
                  >
                    {t("panel.clear")}
                  </button>
                )}
              </StateCard>
            )}
            {visible.length > 0 && (
              <RoomList
                items={visible.slice(0, Math.max(limit, visible.findIndex((v) => v.id === selectedId) + 1))}
                selectedId={selectedId}
                demo={isDemo}
                labels={labels}
                onSelect={select}
              />
            )}
            {visible.length > limit && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE)}
                className={cn(ctaClass("secondary"), "mt-3 w-full")}
                data-testid="show-more"
              >
                {t("panel.showMore", { count: visible.length - limit })}
              </button>
            )}
          </div>
        </aside>
      </div>
      {wishTarget && <WishPanel item={wishTarget} onClose={() => setWishTarget(null)} />}
    </div>
  );
}

function ModeBadge({ demo }: { demo: boolean }) {
  const t = useTranslations("explore");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wider ring-1",
        demo ? "bg-violet/15 text-violet-300 ring-violet/40" : "bg-cyan/10 text-cyan-300 ring-cyan/30",
      )}
      data-testid="mode-badge"
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", demo ? "bg-violet-300" : "bg-cyan")} />
      {demo ? t("mode.demo") : t("mode.live")}
    </span>
  );
}

function StateCard({
  icon,
  title,
  body,
  children,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-2xl bg-midnight-800/60 p-5 ring-1 ring-night-line"
      data-testid={testId}
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-white/6 ring-1 ring-white/10">
        {icon}
      </span>
      <div>
        <p className="font-display text-lg font-extrabold text-white">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-night-muted">{body}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function LoadingList({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" data-testid="explore-loading">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-night-muted">
        <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" /> {label}
      </p>
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[92px] rounded-2xl bg-midnight-800/70 ring-1 ring-night-line motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
