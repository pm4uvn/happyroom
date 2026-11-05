import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { CharacterForm } from "@/features/world/auth/character-form";
import { getDb } from "@/lib/db";
import { readPlayer } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Character · HAPPYROOM World", robots: { index: false } };

export default async function CharacterPage() {
  const db = getDb();
  const player = db ? await readPlayer(db) : null;
  if (!player) redirect("/login");
  const t = await getTranslations("character");
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-party-glow min-h-[calc(100dvh-4rem)] px-4 py-10">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-2 text-ink-soft">{t("subtitle")}</p>
          <div className="mt-6 rounded-[2rem] bg-white/90 p-6 shadow-lift ring-1 ring-line">
            <CharacterForm
              displayName={player.displayName}
              avatar={player.avatar}
              ageBand={player.ageBand}
              chatEnabled={player.chatEnabled}
              showInPlayerList={player.showInPlayerList}
              isPlaceholderName={!player.profileComplete && /^Guest\d{6}$/.test(player.displayName)}
            />
          </div>
        </div>
      </main>
    </>
  );
}
