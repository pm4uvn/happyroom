"use client";

import { useTranslations } from "next-intl";
import { Globe2, Languages, Lock, Sparkles } from "lucide-react";
import { cn } from "@happyroom/ui";
import { TYPE_COLORS } from "./globe/palette";
import type { CelebrationLabels } from "./labels";
import type { PublicCelebration } from "./model";

export function RoomList({
  items,
  selectedId,
  demo,
  labels,
  onSelect,
}: {
  items: PublicCelebration[];
  selectedId: string | null;
  demo: boolean;
  labels: CelebrationLabels;
  onSelect: (item: PublicCelebration) => void;
}) {
  const t = useTranslations("explore");
  return (
    <ul aria-label={t("panel.list")} className="flex flex-col gap-2" data-testid="room-list">
      {items.map((c) => (
        <li key={c.id}>
          <RoomCard
            item={c}
            selected={c.id === selectedId}
            demo={demo}
            labels={labels}
            onSelect={() => onSelect(c)}
          />
        </li>
      ))}
    </ul>
  );
}

function RoomCard({
  item,
  selected,
  demo,
  labels,
  onSelect,
}: {
  item: PublicCelebration;
  selected: boolean;
  demo: boolean;
  labels: CelebrationLabels;
  onSelect: () => void;
}) {
  const t = useTranslations("explore");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-2xl p-3.5 text-left ring-1 transition-[background-color,box-shadow]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan",
        selected
          ? "bg-midnight-600/70 ring-amber/70"
          : "bg-midnight-800/70 ring-night-line hover:bg-midnight-700/80 hover:ring-white/25",
      )}
      data-testid="room-card"
      data-room-id={item.id}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 font-display text-base font-bold leading-snug text-white">{item.name}</span>
        <StatusPill item={item} label={labels.status(item)} />
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] font-semibold text-night-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ backgroundColor: TYPE_COLORS[item.celebrationType] }}
          />
          {labels.type(item.celebrationType)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Globe2 aria-hidden className="size-3.5" /> {labels.country(item.countryCode)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Languages aria-hidden className="size-3.5" /> {labels.language(item.language)}
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-night-muted/90">
        {demo ? (
          <Sparkles aria-hidden className="size-3.5 text-violet-300" />
        ) : (
          <Lock aria-hidden className="size-3.5" />
        )}
        {demo ? t("access.demo") : t("access.invite")}
      </span>
    </button>
  );
}

export function StatusPill({ item, label }: { item: PublicCelebration; label: string }) {
  const live = item.status === "live";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide",
        live ? "bg-cyan/15 text-cyan-300" : "bg-white/8 text-night-muted",
      )}
    >
      {live && <span aria-hidden className="size-1.5 rounded-full bg-cyan motion-safe:animate-pulse" />}
      {label}
    </span>
  );
}
