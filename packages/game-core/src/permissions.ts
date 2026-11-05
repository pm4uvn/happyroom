import type { ParticipantRole } from "@happyroom/shared";

/**
 * Room permission policy. Evaluated on the game server (and mirrored by web API routes)
 * for every privileged action. The client only uses it to hide controls.
 */

export type RoomAction =
  | "chat.send"
  | "emote.send"
  | "wish.send"
  | "wish.moderate"
  | "gift.send"
  | "gift.open"
  | "ceremony.control"
  | "ceremony.blow"
  | "moderation.kick"
  | "moderation.ban"
  | "moderation.mute"
  | "moderation.removeMessage"
  | "room.lock"
  | "room.toggleGifts"
  | "media.upload"
  | "media.moderate"
  | "invite.create";

export interface ActorContext {
  participantId: string;
  role: ParticipantRole;
  muted: boolean;
}

export interface RoomPolicyContext {
  locked: boolean;
  giftsEnabled: boolean;
  chatEnabled: boolean;
}

export interface TargetContext {
  participantId: string;
  role: ParticipantRole;
}

export type PermissionDenial = "forbidden" | "muted" | "gifts_disabled" | "chat_disabled" | "self_target";

export type PermissionResult = { ok: true } | { ok: false; code: PermissionDenial };

const ROLE_RANK: Record<ParticipantRole, number> = { guest: 0, cohost: 1, host: 2 };

const MODERATOR_ACTIONS = new Set<RoomAction>([
  "wish.moderate",
  "moderation.kick",
  "moderation.ban",
  "moderation.mute",
  "moderation.removeMessage",
  "media.moderate",
]);

const HOST_ONLY_ACTIONS = new Set<RoomAction>([
  "ceremony.control",
  "gift.open",
  "room.lock",
  "room.toggleGifts",
  "invite.create",
]);

const SPEECH_ACTIONS = new Set<RoomAction>(["chat.send", "wish.send", "gift.send", "media.upload"]);

const ok: PermissionResult = { ok: true };
const deny = (code: PermissionDenial): PermissionResult => ({ ok: false, code });

export function can(
  actor: ActorContext,
  action: RoomAction,
  room: RoomPolicyContext,
  target?: TargetContext,
): PermissionResult {
  if (HOST_ONLY_ACTIONS.has(action)) return actor.role === "host" ? ok : deny("forbidden");

  if (MODERATOR_ACTIONS.has(action)) {
    if (ROLE_RANK[actor.role] < ROLE_RANK.cohost) return deny("forbidden");
    if (target) {
      if (target.participantId === actor.participantId) return deny("self_target");
      // Moderators may only act on participants of strictly lower rank: the host can never be
      // kicked, and co-hosts cannot remove each other.
      if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) return deny("forbidden");
    }
    return ok;
  }

  if (SPEECH_ACTIONS.has(action) && actor.muted) return deny("muted");
  if (action === "chat.send" && !room.chatEnabled && actor.role === "guest") return deny("chat_disabled");
  if (action === "gift.send" && !room.giftsEnabled) return deny("gifts_disabled");

  return ok;
}

/** Whether a new participant may join. Hosts may always rejoin their own room, even when locked. */
export function canJoin(params: {
  role: ParticipantRole;
  locked: boolean;
  banned: boolean;
  activeCount: number;
  capacity: number;
  alreadyPresent: boolean;
}): { ok: true } | { ok: false; code: "banned" | "room_locked" | "room_full" } {
  if (params.banned) return { ok: false, code: "banned" };
  if (params.role === "host" || params.alreadyPresent) return { ok: true };
  if (params.locked) return { ok: false, code: "room_locked" };
  if (params.activeCount >= params.capacity) return { ok: false, code: "room_full" };
  return { ok: true };
}
