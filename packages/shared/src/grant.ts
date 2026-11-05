import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AVATAR_PRESET_IDS, PARTICIPANT_ROLES } from "./enums.js";

/**
 * Join grants: short-lived, HMAC-SHA256 signed tokens issued by the web API after it has
 * authorised a participant, and verified by the game server before admitting a connection.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, payload part))
 *
 * SERVER-ONLY module (node:crypto). Import via "@happyroom/shared/grant", never from browser code.
 */
export const JOIN_GRANT_AUDIENCE = "happyroom-game";

export const joinGrantPayloadSchema = z.object({
  aud: z.literal(JOIN_GRANT_AUDIENCE),
  /** rooms.id (UUID) */
  roomId: z.uuid(),
  /** room_participants.id (UUID) */
  participantId: z.uuid(),
  role: z.enum(PARTICIPANT_ROLES),
  displayName: z.string().min(1).max(64),
  avatar: z.enum(AVATAR_PRESET_IDS),
  /** issued-at / expiry, epoch seconds */
  iat: z.number().int(),
  exp: z.number().int(),
});
export type JoinGrantPayload = z.infer<typeof joinGrantPayloadSchema>;

export type GrantVerifyError = "malformed" | "bad_signature" | "expired" | "invalid_payload";

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function assertKey(secret: string) {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("JOIN_GRANT_SIGNING_KEY must be at least 32 bytes");
  }
}

export function signJoinGrant(
  claims: Omit<JoinGrantPayload, "aud" | "iat" | "exp">,
  secret: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): string {
  assertKey(secret);
  const iat = Math.floor(nowMs / 1000);
  const payload: JoinGrantPayload = { aud: JOIN_GRANT_AUDIENCE, ...claims, iat, exp: iat + ttlSeconds };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyJoinGrant(
  token: string,
  secret: string,
  nowMs = Date.now(),
): { ok: true; payload: JoinGrantPayload } | { ok: false; error: GrantVerifyError } {
  assertKey(secret);
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, error: "malformed" };
  const [body, sig] = parts as [string, string];
  const expected = createHmac("sha256", secret).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, error: "bad_signature" };
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "malformed" };
  }
  const parsed = joinGrantPayloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  if (parsed.data.exp * 1000 <= nowMs) return { ok: false, error: "expired" };
  return { ok: true, payload: parsed.data };
}

// ---------------------------------------------------------------------------
// World zone grants (HAPPYROOM World). Distinct audience, so a party grant can never be replayed
// into a world zone and vice versa.
// ---------------------------------------------------------------------------
export const WORLD_GRANT_AUDIENCE = "happyroom-world";

export const worldGrantPayloadSchema = z.object({
  aud: z.literal(WORLD_GRANT_AUDIENCE),
  profileId: z.uuid(),
  displayName: z.string().min(2).max(24),
  avatar: z.enum(AVATAR_PRESET_IDS),
  ageBand: z.enum(["under13", "teen", "adult"]),
  chatEnabled: z.boolean(),
  zoneId: z.string().regex(/^[a-z0-9_]{2,48}$/),
  /** Spawn hint (a spawn point id) — the server still validates it and falls back safely. */
  spawnId: z
    .string()
    .regex(/^[a-z0-9_]{2,48}$/)
    .optional(),
  iat: z.number().int(),
  exp: z.number().int(),
});
export type WorldGrantPayload = z.infer<typeof worldGrantPayloadSchema>;

function signRaw(payload: object, secret: string): string {
  assertKey(secret);
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(createHmac("sha256", secret).update(body).digest())}`;
}

export function signWorldGrant(
  claims: Omit<WorldGrantPayload, "aud" | "iat" | "exp">,
  secret: string,
  ttlSeconds: number,
  nowMs = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  return signRaw({ aud: WORLD_GRANT_AUDIENCE, ...claims, iat, exp: iat + ttlSeconds }, secret);
}

export function verifyWorldGrant(
  token: string,
  secret: string,
  nowMs = Date.now(),
): { ok: true; payload: WorldGrantPayload } | { ok: false; error: GrantVerifyError } {
  assertKey(secret);
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, error: "malformed" };
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return { ok: false, error: "bad_signature" };
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "malformed" };
  }
  const parsed = worldGrantPayloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };
  if (parsed.data.exp * 1000 <= nowMs) return { ok: false, error: "expired" };
  return { ok: true, payload: parsed.data };
}
