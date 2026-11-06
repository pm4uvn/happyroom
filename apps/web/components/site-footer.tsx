import { getTranslations } from "next-intl/server";
import { cn } from "@happyroom/ui";
import { AnalyticsSettingsButton } from "./consent-banner";
import { LogoMark } from "./logo";

export async function SiteFooter({ tone = "light" }: { tone?: "light" | "night" }) {
  const night = tone === "night";
  const t = await getTranslations("footer");
  return (
    <footer className={cn("border-t", night ? "border-night-line bg-midnight" : "border-line bg-white/60")}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row sm:px-6">
        <div className={cn("flex items-center gap-2", night ? "text-white" : "text-ink-soft")}>
          <LogoMark className="size-6" />
          <span className="font-semibold">{t("tagline")}</span>
        </div>
        <div className={cn("flex items-center gap-4", night ? "text-night-muted" : "text-ink-muted")}>
          <AnalyticsSettingsButton
            label={t("analyticsSettings")}
            className={night ? "text-night-muted hover:text-white focus-visible:ring-cyan/50" : undefined}
          />
          <span>{t("rights", { year: new Date().getUTCFullYear() })}</span>
        </div>
      </div>
    </footer>
  );
}
