import { z } from "zod";
import type { CEREMONY_PHASES } from "./enums.js";
import { EMOTE_IDS, GIFT_CATALOG_IDS } from "./enums.js";
import { LIMITS } from "./limits.js";
import { multiLineText, optionalMultiLineText, singleLineText } from "./schemas.js";

/**
 * Realtime protocol between browser clients and the authoritative game server.
 *
 * Versioning rules:
 *  - PROTOCOL_VERSION is sent on join. The server rejects clients outside
 *    [MIN_SUPPORTED_PROTOCOL_VERSION, PROTOCOL_VERSION] with a "client_outdated" error
 *    so stale tabs are asked to reload instead of silently misbehaving.
 *  - Additive, optional fields do not bump the version. Renames/removals/semantic changes do.
 *  - Every client message is validated with the schema below before any handler runs.
 *
 * Room *state* (players, positions, ceremony phase) is synchronised by Colyseus schema
 * state; discrete actions use the messages below.
 */
export const PROTOCOL_VERSION = 1;
export const MIN_SUPPORTED_PROTOCOL_VERSION = 1;

/** World units are metres. The room floor is centred on the origin. */
export const finiteNumber = z.number().refine(Number.isFinite, { message: "not_finite" });

export const clientMessageSchemas = {
  /** Movement intent. The server integrates, clamps and validates; it never trusts position blindly. */
  move: z.object({
    seq: z.number().int().nonnegative(),
    x: finiteNumber,
    z: finiteNumber,
    rotY: finiteNumber,
    moving: z.boolean(),
  }),
  emote: z.object({ emote: z.enum(EMOTE_IDS) }),
  chat: z.object({ text: singleLineText(LIMITS.chatMessageMaxChars) }),
  wish: z.object({ body: multiLineText(LIMITS.wishMaxChars) }),
  gift: z.object({
    catalogId: z.enum(GIFT_CATALOG_IDS),
    message: optionalMultiLineText(LIMITS.giftMessageMaxChars),
    idempotencyKey: z.uuid(),
  }),
  openGift: z.object({ giftId: z.string().min(1).max(64) }),
  moderateWish: z.object({ wishId: z.uuid(), approve: z.boolean() }),
  removeGift: z.object({ giftId: z.uuid() }),
  /** Announce that this participant captured a party photo (others are notified). */
  snapshot: z.object({}),
  ceremonyStart: z.object({}),
  ceremonyRestart: z.object({}),
  blowCandles: z.object({}),
  hostKick: z.object({ participantId: z.string().min(1).max(64), ban: z.boolean() }),
  hostMute: z.object({ participantId: z.string().min(1).max(64), muted: z.boolean() }),
  hostLock: z.object({ locked: z.boolean() }),
  hostGifts: z.object({ enabled: z.boolean() }),
  hostRemoveMessage: z.object({ messageId: z.string().min(1).max(64) }),
  ping: z.object({ t: finiteNumber }),
} as const;

export type ClientMessageType = keyof typeof clientMessageSchemas;
export type ClientMessage<T extends ClientMessageType> = z.input<(typeof clientMessageSchemas)[T]>;
export type ParsedClientMessage<T extends ClientMessageType> = z.output<(typeof clientMessageSchemas)[T]>;

export function parseClientMessage<T extends ClientMessageType>(type: T, payload: unknown) {
  return clientMessageSchemas[type].safeParse(payload) as z.ZodSafeParseResult<ParsedClientMessage<T>>;
}

/** Server → client discrete events (state itself is synced separately). */
export type ServerEvent =
  | { type: "emote"; participantId: string; emote: (typeof EMOTE_IDS)[number]; serverTime: number }
  | {
      type: "chat";
      messageId: string;
      participantId: string;
      displayName: string;
      text: string;
      serverTime: number;
    }
  | { type: "chatRemoved"; messageId: string }
  | {
      type: "ceremony";
      phase: (typeof CEREMONY_PHASES)[number];
      phaseStartedAt: number;
      phaseEndsAt: number | null;
      serverTime: number;
    }
  | { type: "error"; code: ProtocolErrorCode; message?: string }
  | { type: "pong"; t: number; serverTime: number };

export const PROTOCOL_ERROR_CODES = [
  "invalid_payload",
  "forbidden",
  "rate_limited",
  "room_locked",
  "room_full",
  "banned",
  "muted",
  "gifts_disabled",
  "duplicate",
  "invalid_transition",
  "client_outdated",
  "unauthorized",
] as const;
export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];

/** Options passed by the client when joining a Colyseus room. */
export const joinOptionsSchema = z.object({
  /**
   * rooms.id of the party. Used for matchmaking (filterBy) so every party gets exactly one room
   * instance. NOTE: Colyseus 0.18 reserves the option name "roomId", hence "partyId".
   */
  partyId: z.uuid(),
  protocolVersion: z.number().int(),
  /** Short-lived signed join grant issued by the web API. */
  grant: z.string().min(16).max(4096),
});
export type JoinOptions = z.infer<typeof joinOptionsSchema>;
