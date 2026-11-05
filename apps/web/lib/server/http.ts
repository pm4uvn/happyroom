import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import type { RateLimitName } from "@happyroom/shared";
import { getDb } from "../db";
import { logger } from "../logger";
import { clientKey, rateLimit } from "../rate-limit";
import { AuthError } from "./player-auth";
import { RoomError } from "./rooms";

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function errorJson(code: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ error: code, ...extra }, status);
}

/** Parse a JSON body (≤ 16 KiB) with a Zod schema; returns field issues as stable codes. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: NextResponse }> {
  const text = await request.text();
  if (text.length > 16 * 1024) return { ok: false, response: errorJson("payload_too_large", 413) };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: errorJson("invalid_json", 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => ({ path: i.path.join("."), code: i.message }));
    return { ok: false, response: errorJson("validation_failed", 422, { fields }) };
  }
  return { ok: true, data: parsed.data };
}

export function limit(request: Request, name: RateLimitName, scope = ""): NextResponse | null {
  const r = rateLimit(name, `${clientKey(request.headers)}:${scope}`);
  if (r.allowed) return null;
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(r.retryAfterMs / 1000)), "cache-control": "no-store" },
    },
  );
}

/** Wrap a handler: require the database, map RoomError to HTTP, log unexpected failures. */
export async function withDb(
  route: string,
  fn: (db: NonNullable<ReturnType<typeof getDb>>) => Promise<NextResponse>,
): Promise<NextResponse> {
  const db = getDb();
  if (!db) return errorJson("not_configured", 503);
  try {
    return await fn(db);
  } catch (err) {
    if (err instanceof RoomError || err instanceof AuthError) return errorJson(err.code, err.status);
    logger.error("route failed", { route, err });
    return errorJson("internal_error", 500);
  }
}
