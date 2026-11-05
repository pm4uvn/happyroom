import { json, withDb } from "@/lib/server/http";
import { endSession } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  return withDb("POST /api/auth/logout", async (db) => {
    await endSession(db);
    return json({ ok: true });
  });
}
