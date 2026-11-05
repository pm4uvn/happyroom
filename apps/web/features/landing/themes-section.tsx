"use client";

import { useTranslations } from "next-intl";
import { Check, Eye } from "lucide-react";
import { THEME_IDS, THEMES } from "@happyroom/shared";
import { Button, cn } from "@happyroom/ui";
import { SceneFallback } from "@/features/room-scene/scene-fallback";
import { usePreview } from "./preview-state";

export function ThemesGrid() {
  const t = useTranslations("themes");
  const { themeId, setTheme, focusPreview } = usePreview();

  return (
    <ul className="grid gap-5 sm:grid-cols-2">
      {THEME_IDS.map((id) => {
        const selected = id === themeId;
        const p = THEMES[id].palette;
        return (
          <li
            key={id}
            className={cn(
              "group overflow-hidden rounded-3xl bg-white shadow-soft ring-1 transition-shadow",
              selected ? "ring-2 ring-dream" : "ring-line hover:shadow-lift",
            )}
          >
            <div className="relative aspect-[16/10] overflow-hidden">
              <SceneFallback
                themeId={id}
                className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="absolute bottom-3 left-3 flex gap-1.5" aria-hidden>
                {[p.accent, p.accentSoft, p.wall, p.floor].map((c) => (
                  <span key={c} className="size-5 rounded-full ring-2 ring-white" style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <div>
                <h3 className="font-display text-xl font-extrabold text-ink">{t(`${id}.name`)}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(`${id}.description`)}</p>
              </div>
              <Button
                variant={selected ? "secondary" : "primary"}
                size="sm"
                className="self-start"
                aria-pressed={selected}
                onClick={() => {
                  setTheme(id);
                  focusPreview();
                }}
              >
                {selected ? <Check aria-hidden /> : <Eye aria-hidden />}
                {selected ? t("selected") : t("preview")}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
