import { z } from "zod";
import { bindBrowserToSession } from "@/lib/server/guest-session";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";
import { findHostSessionByRecoveryCode, findRoomBySlug } from "@/lib/server/rooms";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ recoveryCode: z.string().min(8).max(40) });

/**
 * POST /api/rooms/:slug/recover — a host who lost their browser session proves ownership with the
 * one-time recovery code; this browser is then bound to the host identity (the old browser is signed out).
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const limited = limit(request, "joinAttempt", `recover:${slug}`);
  if (limited) return limited;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  return withDb("POST /api/rooms/:slug/recover", async (db) => {
    const room = await findRoomBySlug(db, slug);
    if (!room) return errorJson("room_not_found", 404);
    const sessionId = await findHostSessionByRecoveryCode(db, room, body.data.recoveryCode);
    await bindBrowserToSession(db, sessionId);
    return json({ ok: true });
  });
}
