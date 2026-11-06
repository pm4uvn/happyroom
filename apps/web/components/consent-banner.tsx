"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, cn } from "@happyroom/ui";
import { getConsent, setConsent } from "@/lib/analytics/client";

export const OPEN_CONSENT_EVENT = "hr:open-consent";

/** Analytics consent prompt. Never blocks the page; declining is as easy as accepting. */
export function ConsentBanner() {
  const t = useTranslations("consent");
  const pathname = usePathname();
  // Never interrupt the immersive party room (it would cover the action bar). Without consent,
  // events there are anonymous anyway; guests can choose on any other page.
  const inParty = pathname?.startsWith("/r/") ?? false;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (inParty) return;
    // Deferred so the banner never competes with first paint.
    const id = window.setTimeout(() => setOpen(getConsent() === "unset"), 1200);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
    };
  }, [inParty]);

  if (!open || inParty) return null;

  const choose = (state: "granted" | "denied") => {
    setConsent(state);
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg animate-pop-in rounded-3xl bg-white p-5 shadow-lift ring-1 ring-line sm:left-auto sm:right-6"
      data-testid="consent-banner"
    >
      <h2 id="consent-title" className="font-display text-base font-extrabold text-ink">
        {t("title")}
      </h2>
      <p id="consent-body" className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        {t("body")}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => choose("denied")}>
          {t("decline")}
        </Button>
        <Button size="sm" onClick={() => choose("granted")}>
          {t("accept")}
        </Button>
      </div>
    </div>
  );
}

export function AnalyticsSettingsButton({ label, className }: { label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className={cn(
        "rounded-md font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35",
        className,
      )}
    >
      {label}
    </button>
  );
}
