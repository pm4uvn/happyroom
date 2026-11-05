import { createRoomInputSchema } from "@happyroom/shared";
import { ensureGuestSession } from "@/lib/server/guest-session";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";
import { createRoom, recordEvent } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

/**
 * POST /api/rooms — create a birthday room as a guest host.
 * Returns the room code, a one-time invitation token and a one-time host recovery code.
 * Neither secret can be retrieved again (only hashes are stored).
 */
export async function POST(request: Request) {
  const limited = limit(request, "roomCreate");
  if (limited) return limited;
  const body = await parseBody(request, createRoomInputSchema);
  if (!body.ok) return body.response;

  return withDb("POST /api/rooms", async (db) => {
    const session = await ensureGuestSession(db);
    const created = await createRoom(db, session.id, body.data);
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    await recordEvent(db, "create_room_complete", created.roomId, {
      roomId: created.roomId,
      themeId: body.data.themeId,
      scheduled: body.data.start.mode === "scheduled",
    });
    if (!created.slug) return errorJson("internal_error", 500);
    return json(
      {
        slug: created.slug,
        roomUrl: `${origin}/r/${created.slug}`,
        inviteUrl: `${origin}/r/${created.slug}?i=${encodeURIComponent(created.inviteToken)}`,
        recoveryCode: created.recoveryCode,
      },
      201,
    );
  });
}
