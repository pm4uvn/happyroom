import { getTranslations } from "next-intl/server";
import {
  EyeOff,
  Gift,
  HeartHandshake,
  Image as ImageIcon,
  Link2,
  Lock,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@happyroom/ui";
import { PrimaryCtas } from "@/components/primary-ctas";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LandingShare } from "@/features/landing/landing-share";
import { LandingViewTracker } from "@/features/landing/landing-view-tracker";
import { LivePreview } from "@/features/landing/live-preview";
import { PreviewProvider } from "@/features/landing/preview-state";
import { ThemesGrid } from "@/features/landing/themes-section";
import { TryCards } from "@/features/landing/try-section";

export default async function LandingPage() {
  const t = await getTranslations();

  const steps: { key: "create" | "invite" | "celebrate"; icon: LucideIcon; tone: string }[] = [
    { key: "create", icon: Wand2, tone: "bg-dream-100 text-dream-700" },
    { key: "invite", icon: Link2, tone: "bg-pink-100 text-pink-600" },
    { key: "celebrate", icon: Gift, tone: "bg-mint-100 text-mint-700" },
  ];

  const privacy: { key: string; icon: LucideIcon }[] = [
    { key: "unlisted", icon: EyeOff },
    { key: "noAccount", icon: UserRoundCheck },
    { key: "hostControls", icon: ShieldCheck },
    { key: "media", icon: ImageIcon },
    { key: "data", icon: Lock },
    { key: "ages", icon: HeartHandshake },
  ];

  return (
    <PreviewProvider>
      <LandingViewTracker />
      <SiteHeader />
      <main id="main" className="bg-party-glow">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-16">
          <div className="flex flex-col gap-6">
            <Badge tone="pink" className="self-start">
              <Sparkles aria-hidden className="size-3.5" /> {t("hero.eyebrow")}
            </Badge>
            <h1 className="text-balance font-display text-5xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-ink-soft">{t("hero.subtitle")}</p>
            <PrimaryCtas id="hero-cta" />
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-ink-soft">
              {(["noInstall", "noSignup", "private"] as const).map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-mint" aria-hidden /> {t(`hero.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <div id="try" className="scroll-mt-24">
            <LivePreview className="aspect-[4/5] w-full sm:aspect-[5/4]" />
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          aria-labelledby="how-title"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6"
        >
          <SectionHeading id="how-title" title={t("steps.title")} subtitle={t("steps.subtitle")} />
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.key} className="relative rounded-3xl bg-white p-6 shadow-soft ring-1 ring-line">
                <span
                  className="absolute right-5 top-4 font-display text-5xl font-extrabold text-dream-100"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className={`grid size-12 place-items-center rounded-2xl ${s.tone}`}>
                  <s.icon aria-hidden className="size-6" />
                </span>
                <h3 className="mt-4 font-display text-2xl font-extrabold text-ink">
                  {t(`steps.${s.key}.title`)}
                </h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{t(`steps.${s.key}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Themes */}
        <section
          id="themes"
          aria-labelledby="themes-title"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6"
        >
          <SectionHeading id="themes-title" title={t("themes.title")} subtitle={t("themes.subtitle")} />
          <div className="mt-10">
            <ThemesGrid />
          </div>
        </section>

        {/* Interactive demonstration */}
        <section aria-labelledby="try-title" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading id="try-title" title={t("demo.title")} subtitle={t("demo.subtitle")} />
          <div className="mt-10">
            <TryCards />
          </div>
        </section>

        {/* Privacy & safety */}
        <section
          id="privacy"
          aria-labelledby="privacy-title"
          className="scroll-mt-20 bg-ink py-20 text-white"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <h2
                id="privacy-title"
                className="text-balance font-display text-4xl font-extrabold tracking-tight"
              >
                {t("privacy.title")}
              </h2>
              <p className="mt-3 text-lg text-white/75">{t("privacy.subtitle")}</p>
            </div>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {privacy.map((p) => (
                <li key={p.key} className="rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/10">
                  <p.icon aria-hidden className="size-6 text-gold" />
                  <h3 className="mt-4 text-lg font-bold">{t(`privacy.${p.key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/75">{t(`privacy.${p.key}.body`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Shareable preview */}
        <section aria-labelledby="share-title" className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
          <div className="rounded-[2rem] bg-white p-6 shadow-lift ring-1 ring-line sm:p-10">
            <h2 id="share-title" className="text-balance font-display text-3xl font-extrabold text-ink">
              {t("share.title")}
            </h2>
            <p className="mt-2 text-ink-soft">{t("share.subtitle")}</p>
            <div className="mt-8">
              <LandingShare
                configuredUrl={process.env.NEXT_PUBLIC_APP_URL || undefined}
                title={t("meta.title")}
                text={t("meta.description")}
              />
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 rounded-[2rem] bg-gradient-to-br from-dream via-dream-600 to-pink px-6 py-14 text-center text-white shadow-lift">
            <h2 className="text-balance font-display text-4xl font-extrabold tracking-tight">
              {t("finalCta.title")}
            </h2>
            <p className="text-lg text-white/85">{t("finalCta.subtitle")}</p>
            <PrimaryCtas id="final-cta" className="items-center [&_p]:text-white/85" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </PreviewProvider>
  );
}

function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="text-balance font-display text-4xl font-extrabold tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-3 text-lg text-ink-soft">{subtitle}</p>
    </div>
  );
}
