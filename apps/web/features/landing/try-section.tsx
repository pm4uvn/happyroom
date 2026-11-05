"use client";

import { useTranslations } from "next-intl";
import { Flame, Palette, Smile } from "lucide-react";
import { THEME_IDS } from "@happyroom/shared";
import { usePreview } from "./preview-state";

/**
 * Guided demonstration: each card performs a real action on the live preview above and brings
 * it into view, so keyboard and screen-reader users get the same demo as pointer users.
 */
export function TryCards() {
  const t = useTranslations("demo");
  const p = usePreview();

  const cards = [
    {
      icon: Flame,
      title: t("stepCake"),
      action: () => {
        if (p.candlesLit) p.blowCandles();
        else p.relight();
        p.focusPreview();
      },
      label: p.candlesLit ? t("tapCake") : t("relight"),
      tone: "bg-pink-100 text-pink-600",
    },
    {
      icon: Smile,
      title: t("stepEmote"),
      action: () => {
        p.sendEmote("dance");
        p.focusPreview();
      },
      label: "💃",
      tone: "bg-mint-100 text-mint-700",
    },
    {
      icon: Palette,
      title: t("stepTheme"),
      action: () => {
        const i = THEME_IDS.indexOf(p.themeId);
        p.setTheme(THEME_IDS[(i + 1) % THEME_IDS.length]!);
        p.focusPreview();
      },
      label: t("goToPreview"),
      tone: "bg-gold-100 text-gold-700",
    },
  ];

  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {cards.map((c, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={c.action}
            className="flex h-full w-full flex-col items-start gap-3 rounded-3xl bg-white p-5 text-left shadow-soft ring-1 ring-line transition-all hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35"
          >
            <span className={`grid size-11 place-items-center rounded-2xl ${c.tone}`}>
              <c.icon aria-hidden className="size-5" />
            </span>
            <span className="font-semibold text-ink">{c.title}</span>
            <span className="mt-auto text-sm font-bold text-dream-700">{c.label} →</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
