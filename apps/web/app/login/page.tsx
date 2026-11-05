import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { LoginForm } from "@/features/world/auth/login-form";
import { getDb } from "@/lib/db";
import { googleConfig, readPlayer } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in · HAPPYROOM World", robots: { index: false } };

export default async function LoginPage() {
  const db = getDb();
  const player = db ? await readPlayer(db) : null;
  if (player) redirect(player.profileComplete ? "/world" : "/world/character");
  const t = await getTranslations("auth");
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-party-glow min-h-[calc(100dvh-4rem)] px-4 py-10">
        <div className="mx-auto max-w-md">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-2 text-ink-soft">{t("subtitle")}</p>
          <div className="mt-6 rounded-[2rem] bg-white/90 p-6 shadow-lift ring-1 ring-line">
            <LoginForm googleEnabled={googleConfig() !== null} next="/world/character" />
          </div>
        </div>
      </main>
    </>
  );
}
