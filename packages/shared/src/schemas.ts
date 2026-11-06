import { z } from "zod";
import {
  AVATAR_PRESET_IDS,
  CAKE_STYLES,
  DECORATION_PRESETS,
  ENABLED_EVENT_TYPES,
  GIFT_CATALOG_IDS,
  REPORT_REASONS,
  REPORT_TARGET_TYPES,
  ROOM_PRIVACY,
  SUPPORTED_LOCALES,
  THEME_IDS,
} from "./enums.js";
import { LIMITS } from "./limits.js";
import { graphemeLength, sanitizeMultiLine, sanitizeSingleLine } from "./text.js";

/** Single-line UGC: sanitised, non-empty, bounded by grapheme count. */
export function singleLineText(maxGraphemes: number) {
  return z
    .string()
    .max(maxGraphemes * 8) // hard byte-ish cap before any processing
    .transform(sanitizeSingleLine)
    .pipe(
      z
        .string()
        .min(1, { message: "required" })
        .refine((v) => graphemeLength(v) <= maxGraphemes, { message: "too_long" }),
    );
}

/** Multi-line UGC: sanitised, non-empty, bounded by grapheme count. */
export function multiLineText(maxGraphemes: number) {
  return z
    .string()
    .max(maxGraphemes * 8)
    .transform(sanitizeMultiLine)
    .pipe(
      z
        .string()
        .min(1, { message: "required" })
        .refine((v) => graphemeLength(v) <= maxGraphemes, { message: "too_long" }),
    );
}

/** Optional single-line text where an empty string is normalised to undefined. */
export function optionalSingleLineText(maxGraphemes: number) {
  return z
    .string()
    .max(maxGraphemes * 8)
    .transform(sanitizeSingleLine)
    .pipe(z.string().refine((v) => graphemeLength(v) <= maxGraphemes, { message: "too_long" }))
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional();
}

/** Optional multi-line text where an empty string is normalised to undefined. */
export function optionalMultiLineText(maxGraphemes: number) {
  return z
    .string()
    .max(maxGraphemes * 8)
    .transform(sanitizeMultiLine)
    .pipe(z.string().refine((v) => graphemeLength(v) <= maxGraphemes, { message: "too_long" }))
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional();
}

export const displayNameSchema = singleLineText(LIMITS.displayNameMaxChars);
export const honoreeNameSchema = singleLineText(LIMITS.honoreeNameMaxChars);

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, { message: "invalid_timezone" });

/** Access codes: case-insensitive, unambiguous alphabet, stored only as a hash. */
export const accessCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[A-Z0-9]{${LIMITS.accessCodeMinChars},${LIMITS.accessCodeMaxChars}}$`), {
    message: "invalid_access_code",
  });

export const localeSchema = z.enum(SUPPORTED_LOCALES);

/** Room creation input (Milestone 2). UTC instants on the wire; timezone kept for display. */
export const createRoomInputSchema = z
  .object({
    eventType: z.enum(ENABLED_EVENT_TYPES),
    honoreeName: honoreeNameSchema,
    hostDisplayName: displayNameSchema,
    themeId: z.enum(THEME_IDS),
    cakeStyle: z.enum(CAKE_STYLES),
    decoration: z.enum(DECORATION_PRESETS),
    start: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("now") }),
      z.object({ mode: z.literal("scheduled"), startsAt: z.iso.datetime({ offset: true }) }),
    ]),
    timeZone: timeZoneSchema,
    privacy: z.enum(ROOM_PRIVACY),
    accessCode: accessCodeSchema.optional(),
    locale: localeSchema,
  })
  .superRefine((value, ctx) => {
    if (value.privacy === "access_code" && !value.accessCode) {
      ctx.addIssue({ code: "custom", path: ["accessCode"], message: "required" });
    }
    if (value.start.mode === "scheduled") {
      const t = Date.parse(value.start.startsAt);
      const now = Date.now();
      if (t < now - 5 * 60_000) ctx.addIssue({ code: "custom", path: ["start"], message: "in_past" });
      if (t > now + 366 * 24 * 3600_000)
        ctx.addIssue({ code: "custom", path: ["start"], message: "too_far" });
    }
  });
export type CreateRoomInput = z.input<typeof createRoomInputSchema>;
export type CreateRoomData = z.output<typeof createRoomInputSchema>;

export const roomSlugSchema = z.string().regex(/^[a-z0-9-]{6,48}$/);

export const joinRoomInputSchema = z.object({
  slug: roomSlugSchema,
  invitationToken: z.string().min(16).max(128).optional(),
  accessCode: accessCodeSchema.optional(),
  displayName: displayNameSchema,
  avatarPreset: z.enum(AVATAR_PRESET_IDS),
});
export type JoinRoomInput = z.input<typeof joinRoomInputSchema>;

export const sendWishInputSchema = z.object({
  body: multiLineText(LIMITS.wishMaxChars),
});

/** A visitor sending congratulations from the Explore dashboard — never requires joining the 3D room. */
export const sendPublicWishInputSchema = z.object({
  roomId: z.uuid(),
  displayName: displayNameSchema,
  body: multiLineText(LIMITS.publicWishMaxChars),
  /** Client-generated; a retried submit with the same key lands once. */
  idempotencyKey: z.uuid(),
});
export type SendPublicWishInput = z.input<typeof sendPublicWishInputSchema>;

export const sendGiftInputSchema = z.object({
  catalogId: z.enum(GIFT_CATALOG_IDS),
  message: optionalMultiLineText(LIMITS.giftMessageMaxChars),
  /** Client-generated idempotency key; duplicates are rejected server-side. */
  idempotencyKey: z.uuid(),
});

export const reportInputSchema = z.object({
  targetType: z.enum(REPORT_TARGET_TYPES),
  targetId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
  details: optionalMultiLineText(500),
});
