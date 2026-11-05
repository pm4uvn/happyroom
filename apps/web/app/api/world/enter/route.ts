import { z } from "zod";
import { signWorldGrant } from "@happyroom/shared/grant";
import { serverEnv } from "@/lib/env";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";
import { requirePlayer } from "@/lib/server/player-auth";
import { getPublishedZone, meetsAgeRequirement } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  zoneId: z.string().regex(/^[a-z0-9_]{2,48}$/),
  spawnId: z
    .string()
    .regex(/^[a-z0-9_]{2,48}$/)
    .optional(),
});

/**
 * POST /api/world/enter — ZoneMatchmaker entry point. Checks the signed-in profile, the zone's
 * published status and permissions, then returns a 10-minute world grant for the game server.
 */
export async function POST(request: Request) {
  const limited = limit(request, "worldEnter");
  if (limited) return limited;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  const { JOIN_GRANT_SIGNING_KEY, GAME_SERVER_PUBLIC_URL } = serverEnv();
  if (!JOIN_GRANT_SIGNING_KEY) return errorJson("not_configured", 503);

  return withDb("POST /api/world/enter", async (db) => {
    const player = await requirePlayer(db, { complete: true });
    const zone = await getPublishedZone(db, body.data.zoneId);
    if (!zone || !zone.permissions.public) return errorJson("zone_not_found", 404);
    if (!meetsAgeRequirement(player.ageBand, zone.permissions.minAgeBand)) return errorJson("forbidden", 403);
    const spawnId =
      body.data.spawnId && zone.spawnPoints.some((s) => s.id === body.data.spawnId)
        ? body.data.spawnId
        : undefined;
    const grant = signWorldGrant(
      {
        profileId: player.id,
        displayName: player.displayName,
        avatar: player.avatar,
        ageBand: player.ageBand,
        chatEnabled: player.chatEnabled,
        zoneId: zone.zoneId,
        ...(spawnId ? { spawnId } : {}),
      },
      JOIN_GRANT_SIGNING_KEY,
      600,
    );
    return json({ grant, gameServerUrl: GAME_SERVER_PUBLIC_URL, zone });
  });
}
