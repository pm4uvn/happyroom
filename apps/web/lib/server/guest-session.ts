import "server-only";
import { cookies } from "next/headers";
import { LIMITS } from "@happyroom/shared";
import type { Db } from "./types";
import { randomToken, sha256 } from "./secrets";

/**
 * Guest identity without accounts. The browser holds an opaque random secret in an httpOnly
 * cookie; the database stores only SHA-256(secret). Expiry slides forward on use.
 */
export const GUEST_COOKIE = "hr_guest";
const TTL_MS = LIMITS.guestSessionTtlHours * 3600_000;

export interface GuestSession {
  id: string;
  displayName: string | null;
  avatarPreset: string | null;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(TTL_MS / 1000),
  };
}

/** Read-only lookup (safe in Server Components, which cannot set cookies). */
export async function readGuestSession(db: Db): Promise<GuestSession | null> {
  const secret = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!secret || secret.length < 20 || secret.length > 100) return null;
  const rows = await db`
    select id, display_name, avatar_preset from guest_sessions
     where secret_hash = ${sha256(secret)} and revoked_at is null and expires_at > now()`;
  const r = rows[0];
  return r ? { id: r.id, displayName: r.display_name, avatarPreset: r.avatar_preset } : null;
}

/** Route handlers only: return the current session, creating one (and its cookie) if needed. */
export async function ensureGuestSession(db: Db): Promise<GuestSession> {
  const existing = await readGuestSession(db);
  const jar = await cookies();
  if (existing) {
    await db`update guest_sessions set last_seen_at = now(), expires_at = ${new Date(Date.now() + TTL_MS)}
             where id = ${existing.id}`;
    const secret = jar.get(GUEST_COOKIE)!.value;
    jar.set(GUEST_COOKIE, secret, cookieOptions());
    return existing;
  }
  const secret = randomToken();
  const [row] = await db`
    insert into guest_sessions (secret_hash, expires_at) values (${sha256(secret)}, ${new Date(Date.now() + TTL_MS)})
    returning id`;
  jar.set(GUEST_COOKIE, secret, cookieOptions());
  return { id: row!.id, displayName: null, avatarPreset: null };
}

/** Give this browser a fresh secret for an existing session row (used by host recovery). */
export async function bindBrowserToSession(db: Db, sessionId: string): Promise<void> {
  const secret = randomToken();
  await db`update guest_sessions set secret_hash = ${sha256(secret)}, last_seen_at = now(),
                 expires_at = ${new Date(Date.now() + TTL_MS)}, revoked_at = null
           where id = ${sessionId}`;
  (await cookies()).set(GUEST_COOKIE, secret, cookieOptions());
}
