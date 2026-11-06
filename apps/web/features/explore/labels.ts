"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { EventType } from "@happyroom/shared";
import { LOCALE_LABELS } from "@/i18n/locale";
import { countryName } from "./countries";
import type { PublicCelebration } from "./model";

/** Shared, localised labels for celebrations (list, preview, tooltip). Client-only rendering. */
export function useCelebrationLabels() {
  const t = useTranslations("explore");
  const locale = useLocale();
  return useMemo(() => {
    const time = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    return {
      country: (code: string) => countryName(code, locale),
      type: (type: EventType) => t(`types.${type}`),
      language: (l: PublicCelebration["language"]) => LOCALE_LABELS[l],
      status: (c: PublicCelebration) =>
        c.status === "live"
          ? t("status.live")
          : c.startsAt
            ? t("status.upcoming", { time: time.format(new Date(c.startsAt)) })
            : t("status.upcomingSoon"),
    };
  }, [t, locale]);
}

export type CelebrationLabels = ReturnType<typeof useCelebrationLabels>;
