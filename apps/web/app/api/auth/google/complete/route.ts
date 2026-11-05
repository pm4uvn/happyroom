import { z } from "zod";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";
import { AuthError, googleConfig, loginWithProvider } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ accessToken: z.string().min(20).max(4096) });

/**
 * POST /api/auth/google/complete — the callback page posts the Supabase access token; we verify it
 * server-side against Supabase Auth (GET /auth/v1/user) and only trust the returned user id.
 * The token itself is never stored or logged.
 */
export async function POST(request: Request) {
  const cfg = googleConfig();
  if (!cfg) return errorJson("not_configured", 503);
  const limited = limit(request, "authAttempt", "google");
  if (limited) return limited;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.response;

  const res = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: { apikey: cfg.anonKey, authorization: `Bearer ${body.data.accessToken}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return errorJson("provider_error", 401);
  const user = (await res.json().catch(() => null)) as {
    id?: string;
    app_metadata?: { provider?: string };
  } | null;
  if (!user?.id || user.app_metadata?.provider !== "google") return errorJson("provider_error", 401);

  return withDb("POST /api/auth/google/complete", async (db) => {
    await loginWithProvider(db, user.id!).catch((e) => {
      if (e instanceof AuthError) throw e;
      throw new AuthError("provider_error", 401);
    });
    return json({ ok: true });
  });
}
