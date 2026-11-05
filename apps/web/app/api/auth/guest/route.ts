import { json, limit, withDb } from "@/lib/server/http";
import { createGuest } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/guest — create an authenticated guest profile bound to this browser. */
export async function POST(request: Request) {
  const limited = limit(request, "accountCreate");
  if (limited) return limited;
  return withDb("POST /api/auth/guest", async (db) => {
    await createGuest(db);
    return json({ ok: true }, 201);
  });
}
