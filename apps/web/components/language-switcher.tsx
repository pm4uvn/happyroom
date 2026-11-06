"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { SUPPORTED_LOCALES } from "@happyroom/shared";
import { cn } from "@happyroom/ui";
import { setLocale } from "@/app/actions/locale";
import { LOCALE_LABELS } from "@/i18n/locale";

export function LanguageSwitcher({ tone = "light" }: { tone?: "light" | "night" }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2 text-sm font-semibold ring-1 focus-within:ring-4",
        tone === "night"
          ? "bg-white/8 text-white ring-white/15 focus-within:ring-cyan/50"
          : "bg-white/70 text-ink-soft ring-line focus-within:ring-dream/35",
      )}
    >
      <Languages aria-hidden className="size-4" />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            const res = await setLocale(next);
            if (res.ok) router.refresh();
          });
        }}
        className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
        data-testid="language-switcher"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} lang={l} className="bg-white text-ink">
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
