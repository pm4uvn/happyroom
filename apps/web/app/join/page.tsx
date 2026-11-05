import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { JoinForm } from "@/features/join/join-form";
import { features } from "@/lib/features";
import { BackToPlaza } from "@/features/world/back-to-plaza";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("join");
  return { title: `${t("title")} · HAPPYROOM`, robots: { index: false } };
}

export default async function JoinPage() {
  if (!features.joinRoom) notFound();
  const t = await getTranslations("join");
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-party-glow px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-xl">
          <BackToPlaza />
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-2 text-ink-soft">{t("subtitle")}</p>
          <div className="mt-6 rounded-[2rem] bg-white/90 p-5 shadow-lift ring-1 ring-line sm:p-8">
            <JoinForm />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
