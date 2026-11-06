"use client";

import { useId, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { EVENT_TYPES, SUPPORTED_LOCALES, type EventType, type SupportedLocale } from "@happyroom/shared";
import { cn } from "@happyroom/ui";
import { useHydrated } from "@/hooks/use-hydrated";
import { LOCALE_LABELS } from "@/i18n/locale";
import { COUNTRIES, countryName, REGIONS, type Region } from "./countries";
import { hasActiveFilters, type ExploreFilters, type PublicCelebration } from "./model";

const field =
  "h-11 w-full rounded-xl bg-midnight-800 px-3 text-sm font-semibold text-white ring-1 ring-night-line " +
  "transition-shadow hover:ring-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan";
const option = "bg-midnight-800 text-white";

export function Filters({
  value,
  onChange,
  celebrations,
}: {
  value: ExploreFilters;
  onChange: (next: ExploreFilters) => void;
  celebrations: readonly PublicCelebration[];
}) {
  const t = useTranslations("explore");
  const locale = useLocale();
  const hydrated = useHydrated();
  const id = useId();

  // Country names come from Intl, which can differ between server and browser: render them on the
  // client only (the select still works before that with "All countries").
  const countries = useMemo(() => {
    if (!hydrated) return [];
    const counts = new Map<string, number>();
    for (const c of celebrations) counts.set(c.countryCode, (counts.get(c.countryCode) ?? 0) + 1);
    const collator = new Intl.Collator(locale);
    return COUNTRIES.filter((c) => !value.region || c.region === value.region)
      .map((c) => ({ code: c.code, name: countryName(c.code, locale), count: counts.get(c.code) ?? 0 }))
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [hydrated, celebrations, locale, value.region]);

  const set = (patch: Partial<ExploreFilters>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-3" role="search" aria-label={t("panel.filters")}>
      <label htmlFor={`${id}-q`} className="sr-only">
        {t("panel.search")}
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-night-muted"
        />
        <input
          id={`${id}-q`}
          type="search"
          value={value.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder={t("panel.searchPlaceholder")}
          autoComplete="off"
          className={cn(field, "pl-9 font-medium placeholder:text-night-muted")}
          data-testid="explore-search"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select
          label={t("panel.region")}
          value={value.region}
          onChange={(v) => {
            const region = v as Region | "";
            const keep = value.country && COUNTRIES.find((c) => c.code === value.country)?.region === region;
            set({ region, country: keep || !region ? value.country : "" });
          }}
          testId="filter-region"
        >
          <option className={option} value="">
            {t("panel.allRegions")}
          </option>
          {REGIONS.map((r) => (
            <option key={r} className={option} value={r}>
              {t(`regions.${r}`)}
            </option>
          ))}
        </Select>
        <Select
          label={t("panel.country")}
          value={value.country}
          onChange={(country) => set({ country })}
          testId="filter-country"
        >
          <option className={option} value="">
            {t("panel.allCountries")}
          </option>
          {countries.map((c) => (
            <option key={c.code} className={option} value={c.code}>
              {c.count ? `${c.name} (${c.count})` : c.name}
            </option>
          ))}
        </Select>
        <Select
          label={t("panel.language")}
          value={value.language}
          onChange={(v) => set({ language: v as SupportedLocale | "" })}
          testId="filter-language"
        >
          <option className={option} value="">
            {t("panel.allLanguages")}
          </option>
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l} className={option} value={l} lang={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </Select>
        <Select
          label={t("panel.type")}
          value={value.type}
          onChange={(v) => set({ type: v as EventType | "" })}
          testId="filter-type"
        >
          <option className={option} value="">
            {t("panel.allTypes")}
          </option>
          {EVENT_TYPES.map((type) => (
            <option key={type} className={option} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </Select>
      </div>
      {hasActiveFilters(value) && (
        <button
          type="button"
          onClick={() => onChange({ query: "", region: "", country: "", language: "", type: "" })}
          className="inline-flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-sm font-semibold text-cyan-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          data-testid="filters-clear"
        >
          <X aria-hidden className="size-4" /> {t("panel.clear")}
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  testId: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-night-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(field, "cursor-pointer truncate pr-2")}
        data-testid={testId}
      >
        {children}
      </select>
    </div>
  );
}
