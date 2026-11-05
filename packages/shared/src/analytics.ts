import { z } from "zod";
import { CEREMONY_PHASES, GIFT_CATALOG_IDS, SUPPORTED_LOCALES, THEME_IDS } from "./enums.js";

/**
 * Privacy-conscious product analytics schema.
 *
 * Rules:
 *  - No free text, names, messages, emails, IPs, access codes or tokens are ever accepted.
 *  - Property objects are `strict`: unknown keys are rejected rather than silently stored.
 *  - `anonymousId` is only attached when the visitor granted analytics consent; without
 *    consent events are recorded as anonymous aggregates (no identifier, no storage on device).
 *  - Room identifiers are internal UUIDs (never slugs, invite tokens or access codes).
 */
export const ANALYTICS_EVENT_NAMES = [
  "landing_view",
  "create_room_start",
  "create_room_complete",
  "invite_share",
  "invite_link_open",
  "guest_join_success",
  "guest_first_interaction",
  "wish_sent",
  "gift_sent",
  "ceremony_started",
  "ceremony_completed",
  "snapshot_created",
  "snapshot_shared",
  "guest_create_room",
  "room_disconnect",
  "room_client_error",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

const shareChannel = z.enum(["copy_link", "native_share", "qr", "download", "other"]);
const uuid = z.uuid();

export const analyticsPropertySchemas = {
  landing_view: z.strictObject({ referrerDomain: z.string().max(253).optional() }),
  create_room_start: z.strictObject({}),
  create_room_complete: z.strictObject({ roomId: uuid, themeId: z.enum(THEME_IDS), scheduled: z.boolean() }),
  invite_share: z.strictObject({ roomId: uuid, channel: shareChannel }),
  invite_link_open: z.strictObject({ roomId: uuid.optional(), hasAttribution: z.boolean() }),
  guest_join_success: z.strictObject({ roomId: uuid, viaInvitation: z.boolean() }),
  guest_first_interaction: z.strictObject({
    roomId: uuid,
    kind: z.enum(["move", "emote", "chat", "wish", "gift", "ceremony"]),
    secondsSinceJoin: z.number().int().nonnegative().max(86_400),
  }),
  wish_sent: z.strictObject({ roomId: uuid }),
  gift_sent: z.strictObject({ roomId: uuid, catalogId: z.enum(GIFT_CATALOG_IDS) }),
  ceremony_started: z.strictObject({ roomId: uuid, participants: z.number().int().nonnegative().max(100) }),
  ceremony_completed: z.strictObject({ roomId: uuid, participants: z.number().int().nonnegative().max(100) }),
  snapshot_created: z.strictObject({ roomId: uuid }),
  snapshot_shared: z.strictObject({ roomId: uuid, channel: shareChannel }),
  guest_create_room: z.strictObject({ roomId: uuid, sourceRoomId: uuid.optional() }),
  room_disconnect: z.strictObject({
    roomId: uuid,
    code: z.number().int(),
    reconnected: z.boolean(),
  }),
  room_client_error: z.strictObject({
    roomId: uuid.optional(),
    /** Error *category*, never a raw message (which may contain user data). */
    category: z.enum(["webgl", "network", "render", "protocol", "unknown"]),
    ceremonyPhase: z.enum(CEREMONY_PHASES).optional(),
  }),
} as const satisfies Record<AnalyticsEventName, z.ZodType>;

export const deviceClassSchema = z.enum(["mobile", "tablet", "desktop", "unknown"]);
export type DeviceClass = z.infer<typeof deviceClassSchema>;

const baseEnvelope = z.object({
  occurredAt: z.iso.datetime({ offset: true }),
  anonymousId: z.uuid().optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  deviceClass: deviceClassSchema.optional(),
});

export type AnalyticsEvent<N extends AnalyticsEventName = AnalyticsEventName> = {
  name: N;
  properties: z.input<(typeof analyticsPropertySchemas)[N]>;
  occurredAt: string;
  anonymousId?: string;
  locale?: (typeof SUPPORTED_LOCALES)[number];
  deviceClass?: DeviceClass;
};

/** Batch accepted by the ingestion endpoint. */
export const analyticsBatchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(20),
});

const envelopeSchema = baseEnvelope.extend({
  name: z.enum(ANALYTICS_EVENT_NAMES),
  properties: z.unknown(),
});

export type ParsedAnalyticsEvent = z.infer<typeof baseEnvelope> & {
  name: AnalyticsEventName;
  properties: Record<string, unknown>;
};

export type AnalyticsParseResult =
  { success: true; data: ParsedAnalyticsEvent } | { success: false; error: z.ZodError };

/** Validates the envelope, then the per-event strict property schema. */
export function parseAnalyticsEvent(input: unknown): AnalyticsParseResult {
  const envelope = envelopeSchema.safeParse(input);
  if (!envelope.success) return { success: false, error: envelope.error };
  const props = analyticsPropertySchemas[envelope.data.name].safeParse(envelope.data.properties ?? {});
  if (!props.success) return { success: false, error: props.error };
  return {
    success: true,
    data: { ...envelope.data, properties: props.data as Record<string, unknown> },
  };
}
