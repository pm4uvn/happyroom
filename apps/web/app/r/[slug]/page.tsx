import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { AVATAR_PRESET_IDS, THEME_IDS, type AvatarPresetId, type ThemeId } from "@happyroom/shared";
import { RoomEntry, type AccessState } from "@/features/party/room-entry";
import { getDb } from "@/lib/db";
import { readGuestSession } from "@/lib/server/guest-session";
import { findInvitation, findMembership, findRoomBySlug, isBanned, recordEvent } from "@/lib/server/rooms";
import { readPlayer } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

/** Room pages are private: never indexed, and link previews reveal nothing about the party. */
export const metadata: Metadata = {
  title: "HAPPYROOM",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

function isFuture(d: Date | null): d is Date {
  return !!d && d.getTime() > Date.now();
}

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ i?: string | string[] }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const db = getDb();
  if (!db) notFound();
  const room = await findRoomBySlug(db, slug.toLowerCase());
  if (!room) notFound();

  const session = await readGuestSession(db);
  const member = await findMembership(db, room.id, session?.id);
  const banned = session ? await isBanned(db, room.id, session.id) : false;
  const token = typeof sp.i === "string" ? sp.i : undefined;
  const invitation = token ? await findInvitation(db, room.id, token) : null;

  if (invitation && !member) {
    await db`update invitations set open_count = open_count + 1 where id = ${invitation.id}`;
    await recordEvent(db, "invite_link_open", room.id, { roomId: room.id, hasAttribution: true });
  }

  let access: AccessState;
  if (banned || member?.removed) access = "removed";
  else if (member) access = "member";
  else if (room.privacy === "access_code") access = "access_code";
  else if (invitation) access = "invited";
  else access = "invite_required";

  // The honoree's name is only shown to people who are allowed in (members / valid invitation).
  const mayView = access === "member" || access === "invited" || (access === "access_code" && !!invitation);
  const locale = await getLocale();
  const startsAtLabel =
    mayView && isFuture(room.startsAt)
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: room.timeZone,
        }).format(room.startsAt) + ` (${room.timeZone.replaceAll("_", " ")})`
      : null;

  const worldPlayer = member || session?.displayName ? null : await readPlayer(db);
  const avatar = (member?.avatarPreset ?? session?.avatarPreset ?? worldPlayer?.avatar ?? "sunny") as string;

  return (
    <RoomEntry
      slug={room.slug}
      themeId={
        (THEME_IDS as readonly string[]).includes(room.themeId) ? (room.themeId as ThemeId) : "cozy_twilight"
      }
      honoree={mayView ? room.honoreeName : null}
      startsAtLabel={startsAtLabel}
      access={access}
      role={member?.role ?? null}
      inviteToken={invitation ? token! : null}
      defaultName={member?.displayName ?? session?.displayName ?? worldPlayer?.displayName ?? ""}
      defaultAvatar={
        (AVATAR_PRESET_IDS as readonly string[]).includes(avatar) ? (avatar as AvatarPresetId) : "sunny"
      }
    />
  );
}
