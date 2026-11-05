import { getTranslations } from "next-intl/server";
import { AnalyticsSettingsButton } from "./consent-banner";
import { LogoMark } from "./logo";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="border-t border-line bg-white/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row sm:px-6">
        <div className="flex items-center gap-2 text-ink-soft">
          <LogoMark className="size-6" />
          <span className="font-semibold">{t("tagline")}</span>
        </div>
        <div className="flex items-center gap-4 text-ink-muted">
          <AnalyticsSettingsButton label={t("analyticsSettings")} />
          <span>{t("rights", { year: new Date().getUTCFullYear() })}</span>
        </div>
      </div>
    </footer>
  );
}
