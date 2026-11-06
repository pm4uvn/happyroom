import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  DoorOpen,
  EyeOff,
  KeyRound,
  Link2,
  MapPinOff,
  PartyPopper,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@happyroom/ui";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ctaClass } from "@/features/explore/cta-class";
import { Explorer } from "@/features/explore/explorer";
import { LandingViewTracker } from "@/features/landing/landing-view-tracker";
import { demoAvailable } from "@/lib/server/discovery";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const allowDemo = demoAvailable();
  const demo = allowDemo && (await searchParams).demo === "1";

  const steps: { key: "create" | "share" | "celebrate"; icon: LucideIcon; tone: string }[] = [
    { key: "create", icon: Wand2, tone: "bg-violet/15 text-violet-300 ring-violet/30" },
    { key: "share", icon: Link2, tone: "bg-cyan/12 text-cyan-300 ring-cyan/30" },
    { key: "celebrate", icon: PartyPopper, tone: "bg-amber/12 text-amber ring-amber/30" },
  ];
  const safety: { key: "unlisted" | "location" | "codes"; icon: LucideIcon }[] = [
    { key: "unlisted", icon: EyeOff },
    { key: "location", icon: MapPinOff },
    { key: "codes", icon: KeyRound },
  ];

  return (
    <div className="min-h-dvh bg-midnight text-white">
      <LandingViewTracker />
      <SiteHeader tone="night" ctas />
      <main id="main">
        {/* Hero + explorer */}
        <section
          id="explore"
          aria-labelledby="hero-title"
          className="relative scroll-mt-16 overflow-hidden bg-[radial-gradient(70rem_36rem_at_80%_-10%,rgb(164_139_255/0.22),transparent_60%),radial-gradient(50rem_30rem_at_-10%_10%,rgb(79_216_235/0.14),transparent_60%)]"
        >
          <div className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 lg:pt-10">
            <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/6 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-300 ring-1 ring-white/10">
                  <Sparkles aria-hidden className="size-3.5" /> {t("explore.eyebrow")}
                </p>
                <h1
                  id="hero-title"
                  className="mt-3 text-balance font-display text-4xl font-extrabold leading-[1.04] tracking-tight sm:text-5xl"
                >
                  {t("hero.title")}
                </h1>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-night-muted sm:text-lg">
                  {t("explore.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/create" className={ctaClass("primary", "lg")} data-testid="cta-create">
                  <PartyPopper aria-hidden className="size-5" /> {t("explore.cta.create")}
                </Link>
                <Link href="/join" className={ctaClass("secondary", "lg")} data-testid="cta-join">
                  <DoorOpen aria-hidden className="size-5" /> {t("explore.cta.join")}
                </Link>
              </div>
            </div>
            <Explorer demo={demo} />
          </div>
        </section>

        {/* Create → Share → Celebrate */}
        <section
          id="how-it-works"
          aria-labelledby="how-title"
          className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6"
        >
          <div className="max-w-2xl">
            <h2
              id="how-title"
              className="text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl"
            >
              {t("explore.steps.title")}
            </h2>
            <p className="mt-2 text-lg text-night-muted">{t("explore.steps.subtitle")}</p>
          </div>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.key} className="relative rounded-3xl bg-midnight-900 p-6 ring-1 ring-night-line">
                <span
                  aria-hidden
                  className="absolute right-5 top-4 font-display text-5xl font-extrabold text-white/6"
                >
                  {i + 1}
                </span>
                <span className={cn("grid size-12 place-items-center rounded-2xl ring-1", s.tone)}>
                  <s.icon aria-hidden className="size-6" />
                </span>
                <h3 className="mt-4 font-display text-2xl font-extrabold">
                  {t(`explore.steps.${s.key}.title`)}
                </h3>
                <p className="mt-2 leading-relaxed text-night-muted">{t(`explore.steps.${s.key}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Privacy & safety */}
        <section
          id="privacy"
          aria-labelledby="privacy-title"
          className="scroll-mt-20 border-y border-night-line bg-midnight-900/60"
        >
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_2fr] lg:items-start">
            <div>
              <h2 id="privacy-title" className="font-display text-3xl font-extrabold tracking-tight">
                {t("explore.safety.title")}
              </h2>
              <p className="mt-2 text-night-muted">{t("explore.safety.subtitle")}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-3">
              {safety.map((s) => (
                <li key={s.key} className="rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/10">
                  <s.icon aria-hidden className="size-6 text-amber" />
                  <h3 className="mt-3 font-bold">{t(`explore.safety.${s.key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-night-muted">
                    {t(`explore.safety.${s.key}.body`)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 rounded-[2rem] bg-[linear-gradient(135deg,#2a2370_0%,#3b2f8f_45%,#14506b_100%)] px-6 py-12 text-center ring-1 ring-white/10">
            <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t("explore.finalCta.title")}
            </h2>
            <p className="text-lg text-white/85">{t("explore.finalCta.subtitle")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/create" className={ctaClass("primary", "lg")} data-testid="final-cta-create">
                <PartyPopper aria-hidden className="size-5" /> {t("explore.cta.create")}
              </Link>
              <Link href="/join" className={ctaClass("secondary", "lg")}>
                <DoorOpen aria-hidden className="size-5" /> {t("explore.cta.join")}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter tone="night" />
    </div>
  );
}
