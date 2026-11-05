import { z } from "zod";
import { json, limit, parseBody, withDb } from "@/lib/server/http";
import { loginPassword, usernameField } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ username: usernameField, password: z.string().min(1).max(128) });

/** POST /api/auth/login — limited per client and per username against guessing. */
export async function POST(request: Request) {
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  const limited = limit(request, "authAttempt", body.data.username);
  if (limited) return limited;
  return withDb("POST /api/auth/login", async (db) => {
    await loginPassword(db, body.data.username, body.data.password);
    return json({ ok: true });
  });
}
