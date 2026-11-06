"use client";

import { useTranslations } from "next-intl";
import { Globe2, Heart, PartyPopper, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@happyroom/ui";
import { ctaClass } from "./cta-class";
import type { SummaryMetric } from "./model";
import { useSummary } from "./use-summary";

/**
 * Four real, bounded numbers above the globe. Each counts ONLY opted-in rooms (never demo or
 * private rooms) and is defined precisely in lib/server/discovery.ts. A metric whose data source
 * (game-server presence) is unreachable shows "Unavailable", never a guessed zero — and nothing
 * here ever animates past the real value.
 */
export function SummaryCards({ demo }: { demo: boolean }) {
  const t = useTranslations("explore.summary");
  const state = useSummary(demo);

  const cards = [
    { key: "celebratingNow", icon: PartyPopper },
    { key: "peopleCelebrating", icon: Users },
    { key: "countriesCelebrating", icon: Globe2 },
    { key: "wishesShared", icon: Heart },
  ] as const;

  const allZero =
    state.status === "ready" &&
    cards.every((c) => state.data[c.key].status === "ok" && (state.data[c.key].value ?? 0) === 0);

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      data-testid="summary-cards"
      aria-label={t("groupLabel")}
    >
      {cards.map(({ key, icon: Icon }) => (
        <SummaryCard
          key={key}
          icon={<Icon aria-hidden className="size-4" />}
          label={t(`${key}.label`)}
          metric={state.status === "ready" ? state.data[key] : null}
          loading={state.status === "loading"}
          error={state.status === "error"}
        />
      ))}
      {allZero && (
        <p className="col-span-2 mt-0.5 flex items-center gap-2 text-xs font-semibold text-night-muted sm:col-span-4">
          {t("allZeroHint")}
          <Link
            href="/create"
            className={cn(ctaClass("secondary"), "h-8 px-3 text-xs")}
            data-testid="summary-empty-cta"
          >
            {t("allZeroCta")}
          </Link>
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  metric,
  loading,
  error,
}: {
  icon: React.ReactNode;
  label: string;
  metric: SummaryMetric | null;
  loading: boolean;
  error: boolean;
}) {
  const t = useTranslations("explore.summary");
  const unavailable = error || metric?.status === "unavailable";
  return (
    <div
      className="flex flex-col gap-1 rounded-2xl bg-midnight-900/70 px-4 py-3 ring-1 ring-night-line"
      data-testid="summary-card"
      data-state={loading ? "loading" : unavailable ? "unavailable" : "ok"}
    >
      <span className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-night-muted">
        {icon} {label}
      </span>
      {loading ? (
        <span className="h-7 w-14 animate-pulse rounded-md bg-white/10" aria-hidden />
      ) : unavailable ? (
        <span className="text-sm font-bold text-night-muted" title={t("unavailableHint")}>
          {t("unavailable")}
        </span>
      ) : (
        <span className="font-display text-2xl font-extrabold text-white">
          {(metric?.value ?? 0).toLocaleString()}
        </span>
      )}
    </div>
  );
}
