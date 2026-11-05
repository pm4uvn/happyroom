import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "@happyroom/shared";

/**
 * Locale resolution without locale-prefixed URLs, so invite links stay identical for every guest
 * regardless of language. Order: explicit cookie → Accept-Language → English.
 */
export const LOCALE_COOKIE = "hr_locale";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Pick the best supported locale from an Accept-Language header (q-values honoured). */
export function negotiateLocale(acceptLanguage: string | null | undefined): SupportedLocale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return { tag: tag.toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((x) => x.tag && x.quality > 0)
    .sort((a, b) => b.quality - a.quality);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  vi: "Tiếng Việt",
  ja: "日本語",
};
