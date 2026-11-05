import { z } from "zod";

/** Realtime protocol for public world zones (separate from the private birthday-party protocol). */
export const WORLD_PROTOCOL_VERSION = 1;

export const AVATAR_IDS = ["sunny", "berry", "mint", "cocoa", "sky", "plum"] as const;
export type WorldAvatarId = (typeof AVATAR_IDS)[number];
export const WORLD_EMOTES = ["wave", "clap", "dance", "celebrate", "heart", "laugh"] as const;
export const AGE_BANDS = ["under13", "teen", "adult"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export const MOVE_ANIMS = ["idle", "walk", "run"] as const;

const finite = z.number().refine(Number.isFinite);

export const worldClientMessages = {
  move: z.object({
    seq: z.number().int().nonnegative(),
    x: finite,
    z: finite,
    rotY: finite,
    anim: z.enum(MOVE_ANIMS),
  }),
  emote: z.object({ emote: z.enum(WORLD_EMOTES) }),
  chat: z.object({ text: z.string().min(1).max(400) }),
  /** Ask the server to use a portal; it checks proximity before granting. */
  usePortal: z.object({ portalId: z.string().regex(/^[a-z0-9_]{2,48}$/) }),
  ping: z.object({ t: finite }),
} as const;
export type WorldClientMessageType = keyof typeof worldClientMessages;
export type WorldClientMessage<T extends WorldClientMessageType> = z.input<(typeof worldClientMessages)[T]>;

export const worldJoinOptionsSchema = z.object({
  zoneId: z.string().regex(/^[a-z0-9_]{2,48}$/),
  protocolVersion: z.number().int(),
  grant: z.string().min(16).max(4096),
});

/** Light profanity screen for public chat (server-side, before broadcast). Intentionally conservative. */
const BLOCKLIST = ["fuck", "shit", "bitch", "cunt", "nigger", "faggot", "đụ", "địt", "lồn", "cặc", "死ね"];
export function screenChat(text: string): { ok: true; text: string } | { ok: false } {
  const lower = text.normalize("NFC").toLowerCase();
  if (BLOCKLIST.some((w) => lower.includes(w))) return { ok: false };
  return { ok: true, text };
}
