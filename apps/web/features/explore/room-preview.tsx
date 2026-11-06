"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DoorOpen, PartyPopper, X } from "lucide-react";
import { ctaClass } from "./cta-class";
import { TYPE_COLORS } from "./globe/palette";
import type { CelebrationLabels } from "./labels";
import type { Cluster, PublicCelebration } from "./model";
import { StatusPill } from "./room-list";

const panel =
  "rounded-3xl bg-midnight-900/92 p-5 text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)] ring-1 ring-white/12 backdrop-blur-md";

/** Details of the selected celebration with the right next step (never a fake join). */
export function RoomPreview({
  item,
  demo,
  labels,
  onClose,
}: {
  item: PublicCelebration;
  demo: boolean;
  labels: CelebrationLabels;
  onClose: () => void;
}) {
  const t = useTranslations("explore");
  const rows: [string, string][] = [
    [t("detail.type"), labels.type(item.celebrationType)],
    [t("detail.country"), labels.country(item.countryCode)],
    [t("detail.language"), labels.language(item.language)],
    [t("detail.when"), labels.status(item)],
  ];
  return (
    <section aria-labelledby={`preview-${item.id}`} className={panel} data-testid="room-preview">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-night-muted">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: TYPE_COLORS[item.celebrationType] }}
            />
            {labels.type(item.celebrationType)}
          </p>
          <h3 id={`preview-${item.id}`} className="mt-1 font-display text-xl font-extrabold leading-tight">
            {item.name}
          </h3>
        </div>
        <CloseButton label={t("detail.close")} onClick={onClose} />
      </div>
      <div className="mt-2">
        <StatusPill item={item} label={labels.status(item)} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs font-semibold text-night-muted">{k}</dt>
            <dd className="truncate font-semibold">{v}</dd>
          </div>
        ))}
        {item.participantCount !== null && (
          <div className="col-span-2">
            <dd className="font-semibold text-cyan-300">
              {t("detail.participants", { count: item.participantCount })}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-night-muted">
        {demo ? t("detail.demoHint") : t("detail.inviteHint")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {demo ? (
          <>
            <span
              role="note"
              className="inline-flex h-11 items-center rounded-full bg-white/6 px-4 text-sm font-semibold text-night-muted ring-1 ring-white/10"
            >
              {t("detail.demoJoin")}
            </span>
            <Link href="/create" className={ctaClass("primary")} data-testid="preview-create">
              <PartyPopper aria-hidden className="size-4" /> {t("detail.createOwn")}
            </Link>
          </>
        ) : (
          <Link href="/join" className={ctaClass("primary")} data-testid="preview-join">
            <DoorOpen aria-hidden className="size-4" /> {t("cta.join")}
          </Link>
        )}
      </div>
    </section>
  );
}

/** Several celebrations share one marker: pick one. */
export function ClusterPreview({
  cluster,
  labels,
  onSelect,
  onClose,
}: {
  cluster: Cluster;
  labels: CelebrationLabels;
  onSelect: (item: PublicCelebration) => void;
  onClose: () => void;
}) {
  const t = useTranslations("explore");
  return (
    <section aria-labelledby={`cluster-${cluster.id}`} className={panel} data-testid="cluster-preview">
      <div className="flex items-start justify-between gap-3">
        <h3 id={`cluster-${cluster.id}`} className="font-display text-lg font-extrabold">
          {t("detail.clusterTitle", { count: cluster.items.length })}
        </h3>
        <CloseButton label={t("detail.close")} onClick={onClose} />
      </div>
      <p className="mt-0.5 text-sm text-night-muted">
        {cluster.countryCodes.map(labels.country).join(" · ")}
      </p>
      <ul className="mt-3 flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
        {cluster.items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-left text-sm font-semibold ring-1 ring-white/8 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: TYPE_COLORS[c.celebrationType] }}
                />
                <span className="truncate">{c.name}</span>
              </span>
              <span className="shrink-0 text-xs text-cyan-300">{t("detail.view")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 text-white ring-1 ring-white/10 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}
