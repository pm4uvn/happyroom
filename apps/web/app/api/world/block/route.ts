import { z } from "zod";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";
import { requirePlayer } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ targetId: z.uuid(), blocked: z.boolean() });

/** POST /api/world/block — block/unblock another player (hides their chat both ways). */
export async function POST(request: Request) {
  const limited = limit(request, "safetyAction");
  if (limited) return limited;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  return withDb("POST /api/world/block", async (db) => {
    const me = await requirePlayer(db);
    if (me.id === body.data.targetId) return errorJson("invalid_target", 422);
    if (body.data.blocked) {
      await db`insert into player_blocks (blocker_id, blocked_id) values (${me.id}, ${body.data.targetId}) on conflict do nothing`;
    } else {
      await db`delete from player_blocks where blocker_id = ${me.id} and blocked_id = ${body.data.targetId}`;
    }
    await db`insert into world_events (profile_id, event_type, payload) values (${me.id}, 'block', ${db.json({ target: body.data.targetId, blocked: body.data.blocked })})`;
    return json({ ok: true });
  });
}
