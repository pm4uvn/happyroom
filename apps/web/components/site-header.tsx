import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DoorOpen, PartyPopper } from "lucide-react";
import { cn } from "@happyroom/ui";
import { ctaClass } from "@/features/explore/cta-class";
import { LanguageSwitcher } from "./language-switcher";
import { LogoMark } from "./logo";

/**
 * Site header. `tone="night"` is the dark Explore dashboard variant; `ctas` adds
 * Join with a Code / Create a Celebration (real flows: /join and /create).
 */
export async function SiteHeader({
  tone = "light",
  ctas = false,
}: {
  tone?: "light" | "night";
  ctas?: boolean;
}) {
  const t = await getTranslations("nav");
  const te = await getTranslations("explore");
  const night = tone === "night";
  const links = [
    { href: "/#explore", label: te("nav.explore") },
    { href: "/world", label: te("nav.world") },
  ];
  const linkClass = cn(
    "rounded-full px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4",
    night
      ? "text-night-muted hover:bg-white/8 hover:text-white focus-visible:ring-cyan/50"
      : "text-ink-soft hover:bg-dream-50 hover:text-ink focus-visible:ring-dream/35",
  );
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur-md",
        night ? "border-night-line bg-midnight/80" : "border-white/50 bg-canvas/75",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/"
            aria-label={t("home")}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-4",
              night ? "focus-visible:ring-cyan/50" : "focus-visible:ring-dream/35",
            )}
          >
            <LogoMark className="size-8" />
            <span
              className={cn(
                "font-display text-lg font-extrabold tracking-tight",
                night ? "text-white" : "text-ink",
                ctas && "hidden min-[400px]:inline",
              )}
            >
              HAPPYROOM
            </span>
          </Link>
          <nav aria-label={te("nav.main")}>
            <ul className="flex items-center gap-0.5">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher tone={tone} />
          {ctas && (
            <>
              <Link
                href="/join"
                className={cn(ctaClass("secondary"), "hidden h-10 lg:inline-flex")}
                data-testid="header-join"
              >
                <DoorOpen aria-hidden className="size-4" /> {te("cta.join")}
              </Link>
              <Link
                href="/create"
                className={cn(ctaClass("primary"), "hidden h-10 md:inline-flex")}
                data-testid="header-create"
              >
                <PartyPopper aria-hidden className="size-4" /> {te("cta.create")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
