import { z } from "zod";
import { json, limit, parseBody, withDb } from "@/lib/server/http";
import { passwordField, registerPassword, usernameField } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ username: usernameField, password: passwordField });

/** POST /api/auth/register — username + password account (scrypt). */
export async function POST(request: Request) {
  const limited = limit(request, "accountCreate");
  if (limited) return limited;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;
  return withDb("POST /api/auth/register", async (db) => {
    await registerPassword(db, body.data.username, body.data.password);
    return json({ ok: true }, 201);
  });
}
