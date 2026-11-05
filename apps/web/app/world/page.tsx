import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WorldEntry } from "@/features/world/world-entry";
import { getDb } from "@/lib/db";
import { readPlayer } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "HAPPYROOM World", robots: { index: false } };

export default async function WorldPage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string; spawn?: string }>;
}) {
  const db = getDb();
  const player = db ? await readPlayer(db) : null;
  if (!player) redirect("/login");
  if (!player.profileComplete) redirect("/world/character");
  const sp = await searchParams;
  let zone = typeof sp.zone === "string" && /^[a-z0-9_]{2,48}$/.test(sp.zone) ? sp.zone : null;
  if (!zone) {
    // Resume where the player was (e.g. back from the Birthday House), else the world's default zone.
    const [loc] = await db!`select z.zone_key from player_locations l join world_zones z on z.id = l.zone_id
                            where l.profile_id = ${player.id} and z.published_status = 'published'`;
    const [w] = await db!`select default_zone_key from worlds where world_key = 'happyroom'`;
    zone =
      (loc?.zone_key as string | undefined) ?? (w?.default_zone_key as string | undefined) ?? "central_plaza";
  }
  return (
    <WorldEntry
      profile={{
        id: player.id,
        displayName: player.displayName,
        avatar: player.avatar,
        ageBand: player.ageBand,
        chatEnabled: player.chatEnabled,
      }}
      initialZone={zone}
      initialSpawn={typeof sp.spawn === "string" ? sp.spawn : undefined}
    />
  );
}
