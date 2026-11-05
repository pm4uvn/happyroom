/**
 * Canonical enumerations shared by web, game-server and database.
 * Values here MUST match the PostgreSQL enum types in supabase/migrations.
 * A test (enums.test.ts) asserts parity against the migration SQL.
 */

export const EVENT_TYPES = ["birthday", "wedding", "graduation", "anniversary", "corporate"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Event types that are enabled for creation in the current release. */
export const ENABLED_EVENT_TYPES = ["birthday"] as const satisfies readonly EventType[];

export const ROOM_STATUSES = ["scheduled", "open", "live", "ended", "archived", "deleted"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** Rooms are never publicly listed. `access_code` additionally requires a code beyond the invite link. */
export const ROOM_PRIVACY = ["invite_link", "access_code"] as const;
export type RoomPrivacy = (typeof ROOM_PRIVACY)[number];

export const PARTICIPANT_ROLES = ["host", "cohost", "guest"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const THEME_IDS = ["cozy_twilight", "sunny_garden"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const CAKE_STYLES = ["classic_vanilla", "berry_dream", "chocolate_gold"] as const;
export type CakeStyle = (typeof CAKE_STYLES)[number];

export const DECORATION_PRESETS = ["balloons_pastel", "balloons_gold", "fairy_lights"] as const;
export type DecorationPreset = (typeof DECORATION_PRESETS)[number];

export const AVATAR_PRESET_IDS = ["sunny", "berry", "mint", "cocoa", "sky", "plum"] as const;
export type AvatarPresetId = (typeof AVATAR_PRESET_IDS)[number];

export const EMOTE_IDS = ["wave", "clap", "dance", "celebrate", "heart", "laugh"] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

export const AVATAR_ANIMATION_STATES = ["idle", "walk", "run", "wave", "clap", "dance", "celebrate"] as const;
export type AvatarAnimationState = (typeof AVATAR_ANIMATION_STATES)[number];

export const GIFT_CATALOG_IDS = [
  "cake_topper",
  "flower_bouquet",
  "teddy_bear",
  "balloon_bouquet",
  "star",
  "confetti_box",
] as const;
export type GiftCatalogId = (typeof GIFT_CATALOG_IDS)[number];

export const CEREMONY_PHASES = [
  "IDLE",
  "PREPARING",
  "COUNTDOWN",
  "CANDLES_OUT",
  "CELEBRATION",
  "COMPLETE",
] as const;
export type CeremonyPhase = (typeof CEREMONY_PHASES)[number];

export const MODERATION_STATUSES = ["pending", "approved", "rejected", "removed"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const ROOM_GIFT_STATUSES = ["sent", "opened", "removed"] as const;
export type RoomGiftStatus = (typeof ROOM_GIFT_STATUSES)[number];

export const MEDIA_KINDS = ["memory_photo", "snapshot", "share_card"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_STATUSES = ["pending_upload", "uploaded", "approved", "rejected", "deleted"] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const REPORT_TARGET_TYPES = ["participant", "chat_message", "wish", "gift", "media"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  "harassment",
  "hate",
  "sexual",
  "spam",
  "self_harm",
  "violence",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ORDER_STATUSES = ["pending", "paid", "failed", "refunded", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PRODUCT_KINDS = ["virtual_gift", "room_theme", "room_upgrade"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const SUPPORTED_LOCALES = ["en", "vi", "ja"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";
