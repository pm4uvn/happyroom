import { z } from "zod";
import { accessCodeSchema, AVATAR_PRESET_IDS, displayNameSchema } from "@happyroom/shared";
import { serverEnv } from "@/lib/env";
import { ensureGuestSession } from "@/lib/server/guest-session";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";
import { authorizeJoin, findRoomBySlug, recordEvent } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  invitationToken: z.string().min(16).max(128).optional(),
  accessCode: accessCodeSchema.optional(),
  displayName: displayNameSchema,
  avatarPreset: z.enum(AVATAR_PRESET_IDS),
});

/**
 * POST /api/rooms/:slug/join — verify access (membership, invitation or access code; bans; lock)
 * and return a 15-minute signed grant for the game server. The slug alone never grants access.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Per-client + per-room limit protects access codes against guessing.
  const limited = limit(request, "joinAttempt", slug);
  if (limited) return limited;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  const { JOIN_GRANT_SIGNING_KEY, GAME_SERVER_PUBLIC_URL } = serverEnv();
  if (!JOIN_GRANT_SIGNING_KEY) return errorJson("not_configured", 503);

  return withDb("POST /api/rooms/:slug/join", async (db) => {
    const room = await findRoomBySlug(db, slug);
    if (!room) return errorJson("room_not_found", 404);
    const session = await ensureGuestSession(db);
    const result = await authorizeJoin(db, room, session.id, body.data, JOIN_GRANT_SIGNING_KEY);
    if (result.isNewParticipant) {
      await recordEvent(db, "guest_join_success", room.id, {
        roomId: room.id,
        viaInvitation: result.viaInvitation,
      });
    }
    return json({
      partyId: result.partyId,
      participantId: result.participantId,
      role: result.role,
      grant: result.grant,
      gameServerUrl: GAME_SERVER_PUBLIC_URL,
    });
  });
}
