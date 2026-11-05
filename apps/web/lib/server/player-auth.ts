import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { graphemeLength, sanitizeSingleLine } from "@happyroom/shared";
import { AGE_BANDS, AVATAR_IDS, type AgeBand, type WorldAvatarId } from "@happyroom/world";
import type { Db } from "./types";
import {
  hashAccessCode as hashSecret,
  randomToken,
  sha256,
  verifyAccessCode as verifySecret,
} from "./secrets";

/**
 * HAPPYROOM World identity. A player profile is created by one of:
 *  - "guest": authenticated guest (no credentials; bound to this browser's session cookie)
 *  - "password": username + password (scrypt)
 *  - "google": Google via Supabase Auth (only when configured; see /api/auth/google/*)
 * Sessions: opaque random secret in the httpOnly `hr_player` cookie; only SHA-256 is stored.
 */
export const PLAYER_COOKIE = "hr_player";
const SESSION_TTL_MS = 30 * 86_400_000;

export interface PlayerProfile {
  id: string;
  authKind: "guest" | "password" | "google";
  displayName: string;
  avatar: WorldAvatarId;
  ageBand: AgeBand;
  username: string | null;
  chatEnabled: boolean;
  showInPlayerList: boolean;
  profileComplete: boolean;
}

export class AuthError extends Error {
  constructor(
    public readonly code:
      | "unauthenticated"
      | "invalid_credentials"
      | "username_taken"
      | "name_taken"
      | "banned"
      | "profile_incomplete"
      | "not_configured"
      | "provider_error",
    public readonly status: number,
  ) {
    super(code);
  }
}

export const displayNameField = z
  .string()
  .max(100)
  .transform(sanitizeSingleLine)
  .pipe(
    z
      .string()
      .refine((v) => graphemeLength(v) >= 2 && graphemeLength(v) <= 24, { message: "invalid_display_name" }),
  );
export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, { message: "invalid_username" });
export const passwordField = z.string().min(10, { message: "password_too_short" }).max(128);
export const avatarField = z.enum(AVATAR_IDS);
export const ageBandField = z.enum(AGE_BANDS);

function toProfile(r: Record<string, unknown>): PlayerProfile {
  return {
    id: r.id as string,
    authKind: r.auth_kind as PlayerProfile["authKind"],
    displayName: r.display_name as string,
    avatar: r.avatar_preset as WorldAvatarId,
    ageBand: r.age_band as AgeBand,
    username: (r.username as string | null) ?? null,
    chatEnabled: r.chat_enabled as boolean,
    showInPlayerList: r.show_in_player_list as boolean,
    profileComplete: r.profile_complete as boolean,
  };
}

const PROFILE_COLUMNS =
  "p.id, p.auth_kind, p.display_name, p.avatar_preset, p.age_band, p.username, p.chat_enabled, p.show_in_player_list, p.profile_complete, p.banned_at";

export async function readPlayer(db: Db): Promise<PlayerProfile | null> {
  const secret = (await cookies()).get(PLAYER_COOKIE)?.value;
  if (!secret || secret.length < 20 || secret.length > 100) return null;
  const rows = await db.unsafe(
    `select ${PROFILE_COLUMNS} from player_sessions s join player_profiles p on p.id = s.profile_id
      where s.secret_hash = $1 and s.revoked_at is null and s.expires_at > now() and p.banned_at is null`,
    [sha256(secret)],
  );
  return rows[0] ? toProfile(rows[0]) : null;
}

export async function requirePlayer(db: Db, opts: { complete?: boolean } = {}): Promise<PlayerProfile> {
  const p = await readPlayer(db);
  if (!p) throw new AuthError("unauthenticated", 401);
  if (opts.complete && !p.profileComplete) throw new AuthError("profile_incomplete", 409);
  return p;
}

async function startSession(db: Db, profileId: string) {
  const secret = randomToken();
  await db`insert into player_sessions (profile_id, secret_hash, expires_at)
           values (${profileId}, ${sha256(secret)}, ${new Date(Date.now() + SESSION_TTL_MS)})`;
  await db`update player_profiles set last_seen_at = now() where id = ${profileId}`;
  (await cookies()).set(PLAYER_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession(db: Db) {
  const jar = await cookies();
  const secret = jar.get(PLAYER_COOKIE)?.value;
  if (secret) await db`update player_sessions set revoked_at = now() where secret_hash = ${sha256(secret)}`;
  jar.delete(PLAYER_COOKIE);
}

/** Temporary unique name until the player picks one on the character screen. */
function placeholderName() {
  return `Guest${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function createGuest(db: Db): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const rows = await db`
      insert into player_profiles (auth_kind, display_name, avatar_preset)
      values ('guest', ${placeholderName()}, 'sunny')
      on conflict do nothing returning id`;
    if (rows[0]) return startSession(db, rows[0].id);
  }
  throw new Error("could not allocate a guest name");
}

export async function registerPassword(db: Db, username: string, password: string): Promise<void> {
  const hash = await hashSecret(password);
  const rows = await db`
    insert into player_profiles (auth_kind, display_name, avatar_preset, username, password_hash)
    values ('password', ${placeholderName()}, 'sunny', ${username}, ${hash})
    on conflict do nothing returning id`;
  if (!rows[0]) {
    const taken = await db`select 1 from player_profiles where username = ${username}`;
    throw new AuthError(taken.length ? "username_taken" : "invalid_credentials", 409);
  }
  await startSession(db, rows[0].id);
}

// Equal-cost dummy verification so unknown usernames take as long as wrong passwords.
let dummyHash: Promise<string> | null = null;

export async function loginPassword(db: Db, username: string, password: string): Promise<void> {
  const rows =
    await db`select id, password_hash, banned_at from player_profiles where username = ${username} and auth_kind = 'password'`;
  const row = rows[0];
  dummyHash ??= hashSecret("dummy-password-for-timing");
  const ok = await verifySecret(password, row?.password_hash ?? (await dummyHash));
  if (!row || !ok) throw new AuthError("invalid_credentials", 401);
  if (row.banned_at) throw new AuthError("banned", 403);
  await startSession(db, row.id);
}

/** Sign in (or create) a profile for a verified OAuth subject. */
export async function loginWithProvider(db: Db, subject: string): Promise<void> {
  const existing = await db`select id, banned_at from player_profiles where provider_subject = ${subject}`;
  if (existing[0]?.banned_at) throw new AuthError("banned", 403);
  let id = existing[0]?.id as string | undefined;
  if (!id) {
    const rows = await db`
      insert into player_profiles (auth_kind, display_name, avatar_preset, provider_subject)
      values ('google', ${placeholderName()}, 'sunny', ${subject}) returning id`;
    id = rows[0]!.id;
  }
  await startSession(db, id!);
}

export interface ProfileUpdate {
  displayName?: string;
  avatar?: WorldAvatarId;
  ageBand?: AgeBand;
  chatEnabled?: boolean;
  showInPlayerList?: boolean;
}

export async function updateProfile(
  db: Db,
  profile: PlayerProfile,
  u: ProfileUpdate,
): Promise<PlayerProfile> {
  if (u.displayName && u.displayName.toLowerCase() !== profile.displayName.toLowerCase()) {
    const taken =
      await db`select 1 from player_profiles where lower(display_name) = lower(${u.displayName}) and id <> ${profile.id}`;
    if (taken.length) throw new AuthError("name_taken", 409);
  }
  const ageBand = u.ageBand ?? profile.ageBand;
  // Safeguard: under-13 players never have public chat, regardless of the requested setting.
  const chatEnabled = ageBand === "under13" ? false : (u.chatEnabled ?? profile.chatEnabled);
  try {
    const rows = await db.unsafe(
      `update player_profiles p set display_name = $2, avatar_preset = $3, age_band = $4, chat_enabled = $5,
              show_in_player_list = $6, profile_complete = true
        where p.id = $1 returning ${PROFILE_COLUMNS}`,
      [
        profile.id,
        u.displayName ?? profile.displayName,
        u.avatar ?? profile.avatar,
        ageBand,
        chatEnabled,
        u.showInPlayerList ?? profile.showInPlayerList,
      ],
    );
    return toProfile(rows[0]!);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new AuthError("name_taken", 409);
    throw e;
  }
}

export function publicProfile(p: PlayerProfile) {
  return {
    id: p.id,
    authKind: p.authKind,
    displayName: p.displayName,
    avatar: p.avatar,
    ageBand: p.ageBand,
    username: p.username,
    chatEnabled: p.chatEnabled,
    showInPlayerList: p.showInPlayerList,
    profileComplete: p.profileComplete,
  };
}

export function googleConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (process.env.AUTH_GOOGLE_ENABLED !== "true" || !url || !anonKey) return null;
  return { url, anonKey };
}
