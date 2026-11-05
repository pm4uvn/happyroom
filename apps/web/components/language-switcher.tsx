"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { SUPPORTED_LOCALES } from "@happyroom/shared";
import { setLocale } from "@/app/actions/locale";
import { LOCALE_LABELS } from "@/i18n/locale";

export function LanguageSwitcher() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full bg-white/70 py-1.5 pl-3 pr-2 text-sm font-semibold text-ink-soft ring-1 ring-line focus-within:ring-4 focus-within:ring-dream/35">
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
          <option key={l} value={l} lang={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
