import { z } from "zod";
import { REPORT_REASONS, sanitizeMultiLine } from "@happyroom/shared";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";
import { requirePlayer } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  targetId: z.uuid(),
  zoneId: z
    .string()
    .regex(/^[a-z0-9_]{2,48}$/)
    .optional(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(1000).optional(),
  /** The reported chat line (chat is not otherwise stored). */
  chatText: z.string().max(400).optional(),
});

/** POST /api/world/report — report a player to moderators (docs/SECURITY.md runbook). */
export async function POST(request: Request) {
  const limited = limit(request, "safetyAction");
  if (limited) return limited;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  return withDb("POST /api/world/report", async (db) => {
    const me = await requirePlayer(db);
    if (me.id === body.data.targetId) return errorJson("invalid_target", 422);
    const [zone] = body.data.zoneId
      ? await db`select id from world_zones where zone_key = ${body.data.zoneId}`
      : [];
    await db`insert into player_reports (reporter_id, target_id, zone_id, reason, details, evidence)
             values (${me.id}, ${body.data.targetId}, ${zone?.id ?? null}, ${body.data.reason},
                     ${body.data.details ? sanitizeMultiLine(body.data.details) : null},
                     ${db.json(body.data.chatText ? { chatText: body.data.chatText } : {})})`;
    await db`insert into world_events (profile_id, event_type, payload) values (${me.id}, 'report', ${db.json({ target: body.data.targetId, reason: body.data.reason })})`;
    return json({ ok: true }, 201);
  });
}
