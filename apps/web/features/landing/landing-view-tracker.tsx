"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { isSupportedLocale } from "@/i18n/locale";
import { track } from "@/lib/analytics/client";

// Module-level guard: one event per page load, even under StrictMode's double effects or locale switches.
let sent = false;

/** Records one `landing_view` per page load. Only the referrer's domain is kept, never the full URL. */
export function LandingViewTracker() {
  const locale = useLocale();
  useEffect(() => {
    if (sent) return;
    sent = true;
    let referrerDomain: string | undefined;
    try {
      const host = document.referrer ? new URL(document.referrer).hostname : "";
      if (host && host !== window.location.hostname) referrerDomain = host.slice(0, 253);
    } catch {
      /* malformed referrer */
    }
    track(
      "landing_view",
      referrerDomain ? { referrerDomain } : {},
      isSupportedLocale(locale) ? locale : undefined,
    );
  }, [locale]);
  return null;
}
