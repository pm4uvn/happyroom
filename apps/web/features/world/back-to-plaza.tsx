"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

/** Set by the Birthday House menu; lets the private-party flow return to the world afterwards. */
export const FROM_WORLD_KEY = "hr_from_world";

export function cameFromWorld(): boolean {
  try {
    return sessionStorage.getItem(FROM_WORLD_KEY) === "1";
  } catch {
    return false;
  }
}

const noop = () => () => {};

/** "← Back to Plaza" link, rendered only when the visitor came from HAPPYROOM World. */
export function BackToPlaza({ className }: { className?: string }) {
  const t = useTranslations("world");
  const show = useSyncExternalStore(noop, cameFromWorld, () => false);
  if (!show) return null;
  return (
    <Link
      href="/world"
      className={
        className ?? "inline-flex items-center gap-1 text-sm font-bold text-dream-700 hover:underline"
      }
      data-testid="back-to-plaza"
    >
      <ArrowLeft aria-hidden className="size-4" /> {t("backToPlaza")}
    </Link>
  );
}
