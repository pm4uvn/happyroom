import type {
  AvatarPresetId,
  CakeStyle,
  DecorationPreset,
  EmoteId,
  GiftCatalogId,
  ThemeId,
} from "./enums.js";

/**
 * Static catalog definitions. Display strings are translation keys (see apps/web/messages),
 * never hardcoded labels. The database seeds (supabase/seeds) mirror the gift and theme ids.
 */

export interface ThemePalette {
  wall: string;
  floor: string;
  accent: string;
  accentSoft: string;
  light: string;
  ambient: string;
  sky: string;
  fog: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  nameKey: string;
  descriptionKey: string;
  palette: ThemePalette;
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  cozy_twilight: {
    id: "cozy_twilight",
    nameKey: "themes.cozy_twilight.name",
    descriptionKey: "themes.cozy_twilight.description",
    palette: {
      wall: "#E9E3FF",
      floor: "#C9B8F2",
      accent: "#9178E8",
      accentSoft: "#F9A6BA",
      light: "#FFE7C2",
      ambient: "#B9A9FF",
      sky: "#2A2F55",
      fog: "#3A3570",
    },
  },
  sunny_garden: {
    id: "sunny_garden",
    nameKey: "themes.sunny_garden.name",
    descriptionKey: "themes.sunny_garden.description",
    palette: {
      wall: "#FFF6E3",
      floor: "#BFE7DD",
      accent: "#6BCBBE",
      accentSoft: "#F5C870",
      light: "#FFF4D6",
      ambient: "#FFE9C7",
      sky: "#CDEBFF",
      fog: "#E9F6FF",
    },
  },
};

export interface AvatarPresetDefinition {
  id: AvatarPresetId;
  nameKey: string;
  body: string;
  accent: string;
  /** Simple, safe accessory set; no free-form uploads in MVP. */
  accessory: "party_hat" | "bow" | "crown" | "headphones" | "flower" | "beanie";
}

export const AVATAR_PRESETS: Record<AvatarPresetId, AvatarPresetDefinition> = {
  sunny: {
    id: "sunny",
    nameKey: "avatars.sunny",
    body: "#F5C870",
    accent: "#9178E8",
    accessory: "party_hat",
  },
  berry: { id: "berry", nameKey: "avatars.berry", body: "#F9A6BA", accent: "#182238", accessory: "bow" },
  mint: { id: "mint", nameKey: "avatars.mint", body: "#6BCBBE", accent: "#F5C870", accessory: "crown" },
  cocoa: {
    id: "cocoa",
    nameKey: "avatars.cocoa",
    body: "#B07D62",
    accent: "#F9A6BA",
    accessory: "headphones",
  },
  sky: { id: "sky", nameKey: "avatars.sky", body: "#8EC5FF", accent: "#FFFFFF", accessory: "flower" },
  plum: { id: "plum", nameKey: "avatars.plum", body: "#9178E8", accent: "#6BCBBE", accessory: "beanie" },
};

export interface CakeDefinition {
  id: CakeStyle;
  nameKey: string;
  tiers: readonly string[];
  frosting: string;
  candles: number;
}

export const CAKES: Record<CakeStyle, CakeDefinition> = {
  classic_vanilla: {
    id: "classic_vanilla",
    nameKey: "cakes.classic_vanilla",
    tiers: ["#FFF3D9", "#FFE8BF"],
    frosting: "#FFFFFF",
    candles: 5,
  },
  berry_dream: {
    id: "berry_dream",
    nameKey: "cakes.berry_dream",
    tiers: ["#F9A6BA", "#FFC9D6"],
    frosting: "#FFF0F4",
    candles: 5,
  },
  chocolate_gold: {
    id: "chocolate_gold",
    nameKey: "cakes.chocolate_gold",
    tiers: ["#6B4434", "#8A5A44"],
    frosting: "#F5C870",
    candles: 5,
  },
};

export interface DecorationDefinition {
  id: DecorationPreset;
  nameKey: string;
  colors: readonly string[];
}

export const DECORATIONS: Record<DecorationPreset, DecorationDefinition> = {
  balloons_pastel: {
    id: "balloons_pastel",
    nameKey: "decorations.balloons_pastel",
    colors: ["#9178E8", "#F9A6BA", "#6BCBBE", "#F5C870"],
  },
  balloons_gold: {
    id: "balloons_gold",
    nameKey: "decorations.balloons_gold",
    colors: ["#F5C870", "#FFFFFF", "#E8B04F"],
  },
  fairy_lights: {
    id: "fairy_lights",
    nameKey: "decorations.fairy_lights",
    colors: ["#FFE7A3", "#FFD27A", "#FFF4D6"],
  },
};

export interface GiftDefinition {
  id: GiftCatalogId;
  nameKey: string;
  color: string;
  icon: string;
}

export const GIFTS: Record<GiftCatalogId, GiftDefinition> = {
  cake_topper: { id: "cake_topper", nameKey: "gifts.cake_topper", color: "#F5C870", icon: "🎂" },
  flower_bouquet: { id: "flower_bouquet", nameKey: "gifts.flower_bouquet", color: "#F9A6BA", icon: "💐" },
  teddy_bear: { id: "teddy_bear", nameKey: "gifts.teddy_bear", color: "#B07D62", icon: "🧸" },
  balloon_bouquet: { id: "balloon_bouquet", nameKey: "gifts.balloon_bouquet", color: "#9178E8", icon: "🎈" },
  star: { id: "star", nameKey: "gifts.star", color: "#F5C870", icon: "⭐" },
  confetti_box: { id: "confetti_box", nameKey: "gifts.confetti_box", color: "#6BCBBE", icon: "🎊" },
};

export interface EmoteDefinition {
  id: EmoteId;
  nameKey: string;
  icon: string;
  durationMs: number;
}

export const EMOTES: Record<EmoteId, EmoteDefinition> = {
  wave: { id: "wave", nameKey: "emotes.wave", icon: "👋", durationMs: 1800 },
  clap: { id: "clap", nameKey: "emotes.clap", icon: "👏", durationMs: 1800 },
  dance: { id: "dance", nameKey: "emotes.dance", icon: "💃", durationMs: 4000 },
  celebrate: { id: "celebrate", nameKey: "emotes.celebrate", icon: "🥳", durationMs: 2500 },
  heart: { id: "heart", nameKey: "emotes.heart", icon: "💖", durationMs: 1800 },
  laugh: { id: "laugh", nameKey: "emotes.laugh", icon: "😂", durationMs: 1800 },
};
