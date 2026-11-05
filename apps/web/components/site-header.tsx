import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./language-switcher";
import { LogoMark } from "./logo";

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const tw = await getTranslations("nav2");
  const links = [
    { href: "/#how-it-works", label: t("howItWorks") },
    { href: "/#themes", label: t("themes") },
    { href: "/#try", label: t("demo") },
    { href: "/#privacy", label: t("privacy") },
    { href: "/world", label: tw("world") },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-white/50 bg-canvas/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={t("home")}
          className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35"
        >
          <LogoMark className="size-8" />
          <span className="font-display text-lg font-extrabold tracking-tight text-ink">HAPPYROOM</span>
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="rounded-full px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-dream-50 hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
