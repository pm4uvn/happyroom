import { z } from "zod";
import { readGuestSession } from "@/lib/server/guest-session";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";
import { findRoomBySlug, mintInvitation, recordEvent } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ channel: z.enum(["link", "qr", "native_share", "other"]).default("link") });

/** POST /api/rooms/:slug/invitations — host-only: mint a new invitation link (attributed to the host). */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const limited = limit(request, "invitationCreate");
  if (limited) return limited;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  return withDb("POST /api/rooms/:slug/invitations", async (db) => {
    const room = await findRoomBySlug(db, slug);
    if (!room) return errorJson("room_not_found", 404);
    const session = await readGuestSession(db);
    if (!session) return errorJson("forbidden", 403);
    const token = await mintInvitation(db, room, session.id, body.data.channel);
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const channel =
      body.data.channel === "native_share" ? "native_share" : body.data.channel === "qr" ? "qr" : "copy_link";
    await recordEvent(db, "invite_share", room.id, { roomId: room.id, channel });
    return json({ inviteUrl: `${origin}/r/${room.slug}?i=${encodeURIComponent(token)}` }, 201);
  });
}
