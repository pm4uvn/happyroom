import "server-only";
import {
  LIMITS,
  type AvatarPresetId,
  type CreateRoomData,
  type ParticipantRole,
  type ThemeId,
} from "@happyroom/shared";
import { signJoinGrant } from "@happyroom/shared/grant";
import type { Db } from "./types";
import {
  hashAccessCode,
  newRecoveryCode,
  newRoomSlug,
  normalizeRecoveryCode,
  randomToken,
  sha256,
  verifyAccessCode,
} from "./secrets";

/**
 * Room domain service. Every function here runs on the trusted server with a privileged DB
 * connection, so each one performs its own authorisation (docs/SECURITY.md).
 */

export class RoomError extends Error {
  constructor(
    public readonly code:
      | "room_not_found"
      | "invitation_required"
      | "invalid_invitation"
      | "access_code_required"
      | "invalid_access_code"
      | "room_locked"
      | "banned"
      | "removed"
      | "forbidden"
      | "invalid_recovery_code"
      | "not_configured",
    public readonly status: number,
  ) {
    super(code);
  }
}

export interface RoomRecord {
  id: string;
  slug: string;
  honoreeName: string;
  themeId: ThemeId;
  cakeStyle: string;
  decoration: string;
  status: string;
  privacy: "invite_link" | "access_code";
  accessCodeHash: string | null;
  locked: boolean;
  startsAt: Date | null;
  timeZone: string;
  expiresAt: Date;
}

export async function findRoomBySlug(db: Db, slug: string): Promise<RoomRecord | null> {
  if (!/^[a-z0-9-]{6,48}$/.test(slug)) return null;
  const rows = await db`
    select id, slug, honoree_name, theme_id, cake_style, decoration, status, privacy, access_code_hash,
           locked, starts_at, time_zone, expires_at
      from rooms
     where slug = ${slug} and deleted_at is null and status not in ('archived', 'deleted') and expires_at > now()`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    honoreeName: r.honoree_name,
    themeId: r.theme_id,
    cakeStyle: r.cake_style,
    decoration: r.decoration,
    status: r.status,
    privacy: r.privacy,
    accessCodeHash: r.access_code_hash,
    locked: r.locked,
    startsAt: r.starts_at,
    timeZone: r.time_zone,
    expiresAt: r.expires_at,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreatedRoom {
  roomId: string;
  slug: string;
  inviteToken: string;
  recoveryCode: string;
}

export async function createRoom(db: Db, sessionId: string, input: CreateRoomData): Promise<CreatedRoom> {
  const startsAt = input.start.mode === "scheduled" ? new Date(input.start.startsAt) : null;
  const base = startsAt && startsAt.getTime() > Date.now() ? startsAt.getTime() : Date.now();
  const expiresAt = new Date(base + LIMITS.roomDefaultLifetimeDays * 86_400_000);
  const accessCodeHash =
    input.privacy === "access_code" && input.accessCode ? await hashAccessCode(input.accessCode) : null;
  const inviteToken = randomToken();
  const recoveryCode = newRecoveryCode();

  // `sql.begin` is only available on the root client; callers pass the root client.
  const root = db as Extract<Db, { begin: unknown }>;
  return root.begin(async (tx) => {
    let slug = "";
    let roomId = "";
    for (let attempt = 0; attempt < 5 && !roomId; attempt++) {
      slug = newRoomSlug();
      const rows = await tx`
        insert into rooms (slug, event_type, title, honoree_name, theme_id, cake_style, decoration, status, privacy,
                           access_code_hash, host_guest_session_id, starts_at, time_zone, locale, expires_at)
        values (${slug}, ${input.eventType}, ${input.honoreeName}, ${input.honoreeName}, ${input.themeId},
                ${input.cakeStyle}, ${input.decoration}, ${startsAt && startsAt.getTime() > Date.now() ? "scheduled" : "open"},
                ${input.privacy}, ${accessCodeHash}, ${sessionId}, ${startsAt}, ${input.timeZone}, ${input.locale}, ${expiresAt})
        on conflict (slug) do nothing
        returning id`;
      roomId = rows[0]?.id ?? "";
    }
    if (!roomId) throw new Error("could not allocate a room code");

    const [host] = await tx`
      insert into room_participants (room_id, guest_session_id, role, display_name, avatar_preset)
      values (${roomId}, ${sessionId}, 'host', ${input.hostDisplayName}, 'sunny')
      returning id`;
    await tx`insert into invitations (room_id, token_hash, created_by_participant_id, channel, label)
             values (${roomId}, ${sha256(inviteToken)}, ${host!.id}, 'link', 'default')`;
    await tx`insert into room_objects (room_id, object_type, preset_key)
             values (${roomId}, 'cake', ${input.cakeStyle}), (${roomId}, 'balloon_cluster', ${input.decoration})`;
    await tx`update guest_sessions set recovery_code_hash = ${sha256(normalizeRecoveryCode(recoveryCode))},
                   display_name = ${input.hostDisplayName}
             where id = ${sessionId}`;
    return { roomId, slug, inviteToken, recoveryCode };
  });
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export interface InvitationRecord {
  id: string;
}

/** A usable invitation for this room (not revoked, not expired, uses left), or null. */
export async function findInvitation(
  db: Db,
  roomId: string,
  token: string | undefined,
): Promise<InvitationRecord | null> {
  if (!token || token.length < 16 || token.length > 128) return null;
  const rows = await db`
    select id from invitations
     where room_id = ${roomId} and token_hash = ${sha256(token)} and revoked_at is null
       and (expires_at is null or expires_at > now())
       and (max_uses is null or use_count < max_uses)`;
  return rows[0] ? { id: rows[0].id } : null;
}

export interface MembershipRecord {
  participantId: string;
  role: ParticipantRole;
  displayName: string;
  avatarPreset: AvatarPresetId;
  removed: boolean;
}

export async function findMembership(
  db: Db,
  roomId: string,
  sessionId: string | undefined,
): Promise<MembershipRecord | null> {
  if (!sessionId) return null;
  const rows = await db`
    select id, role, display_name, avatar_preset, removed_at from room_participants
     where room_id = ${roomId} and guest_session_id = ${sessionId}`;
  const r = rows[0];
  return r
    ? {
        participantId: r.id,
        role: r.role,
        displayName: r.display_name,
        avatarPreset: r.avatar_preset,
        removed: !!r.removed_at,
      }
    : null;
}

export async function isBanned(db: Db, roomId: string, sessionId: string): Promise<boolean> {
  const rows = await db`
    select 1 from room_bans where room_id = ${roomId} and guest_session_id = ${sessionId}
       and (expires_at is null or expires_at > now())`;
  return rows.length > 0;
}

export interface JoinInput {
  invitationToken?: string;
  accessCode?: string;
  displayName: string;
  avatarPreset: AvatarPresetId;
}

export interface JoinResult {
  partyId: string;
  participantId: string;
  role: ParticipantRole;
  grant: string;
  isNewParticipant: boolean;
  viaInvitation: boolean;
}

/**
 * Authorise a join and mint a short-lived game-server grant.
 * Rules: existing members rejoin freely (unless removed/banned). New guests need a valid invitation
 * (invite-link rooms) or the correct access code (access-code rooms). Locked rooms admit no new guests.
 */
export async function authorizeJoin(
  db: Db,
  room: RoomRecord,
  sessionId: string,
  input: JoinInput,
  grantKey: string,
): Promise<JoinResult> {
  if (await isBanned(db, room.id, sessionId)) throw new RoomError("banned", 403);
  const member = await findMembership(db, room.id, sessionId);
  if (member?.removed) throw new RoomError("removed", 403);

  let invitation: InvitationRecord | null = null;
  if (!member) {
    if (room.locked) throw new RoomError("room_locked", 403);
    invitation = await findInvitation(db, room.id, input.invitationToken);
    if (room.privacy === "access_code") {
      if (!input.accessCode) throw new RoomError("access_code_required", 401);
      if (!room.accessCodeHash || !(await verifyAccessCode(input.accessCode, room.accessCodeHash))) {
        throw new RoomError("invalid_access_code", 401);
      }
    } else if (!invitation) {
      throw new RoomError(input.invitationToken ? "invalid_invitation" : "invitation_required", 403);
    }
  }

  let participantId: string;
  let role: ParticipantRole;
  if (member) {
    participantId = member.participantId;
    role = member.role;
    await db`update room_participants set display_name = ${input.displayName}, avatar_preset = ${input.avatarPreset},
                    last_seen_at = now()
             where id = ${participantId}`;
  } else {
    const [p] = await db`
      insert into room_participants (room_id, guest_session_id, role, display_name, avatar_preset, invitation_id)
      values (${room.id}, ${sessionId}, 'guest', ${input.displayName}, ${input.avatarPreset}, ${invitation?.id ?? null})
      on conflict (room_id, guest_session_id) do update set display_name = excluded.display_name,
             avatar_preset = excluded.avatar_preset, last_seen_at = now()
      returning id, role`;
    participantId = p!.id;
    role = p!.role;
    if (invitation) await db`update invitations set use_count = use_count + 1 where id = ${invitation.id}`;
  }
  await db`update guest_sessions set display_name = ${input.displayName}, avatar_preset = ${input.avatarPreset}
           where id = ${sessionId}`;

  const grant = signJoinGrant(
    { roomId: room.id, participantId, role, displayName: input.displayName, avatar: input.avatarPreset },
    grantKey,
    LIMITS.joinGrantTtlSeconds,
  );
  return {
    partyId: room.id,
    participantId,
    role,
    grant,
    isNewParticipant: !member,
    viaInvitation: !!invitation,
  };
}

// ---------------------------------------------------------------------------
// Invitations & recovery
// ---------------------------------------------------------------------------

/** Host mints a fresh invitation link (tokens are stored hashed, so old links cannot be re-shown). */
export async function mintInvitation(
  db: Db,
  room: RoomRecord,
  sessionId: string,
  channel: "link" | "qr" | "native_share" | "other",
) {
  const member = await findMembership(db, room.id, sessionId);
  if (!member || member.removed || member.role !== "host") throw new RoomError("forbidden", 403);
  const token = randomToken();
  await db`insert into invitations (room_id, token_hash, created_by_participant_id, channel)
           values (${room.id}, ${sha256(token)}, ${member.participantId}, ${channel})`;
  return token;
}

/** Re-bind host ownership to this browser using the one-time recovery code. Returns the session id. */
export async function findHostSessionByRecoveryCode(db: Db, room: RoomRecord, code: string): Promise<string> {
  const rows = await db`
    select g.id from guest_sessions g
      join room_participants p on p.guest_session_id = g.id and p.room_id = ${room.id} and p.role = 'host'
     where g.recovery_code_hash = ${sha256(normalizeRecoveryCode(code))}`;
  if (!rows[0]) throw new RoomError("invalid_recovery_code", 401);
  return rows[0].id;
}

export async function recordEvent(
  db: Db,
  name: string,
  roomId: string | null,
  properties: Record<string, unknown>,
) {
  try {
    await db`insert into analytics_events (event_name, occurred_at, room_id, source, properties)
             values (${name}, now(), ${roomId}, 'api', ${(db as Extract<Db, { json: unknown }>).json(properties as never)})`;
  } catch {
    /* analytics never breaks the product */
  }
}
