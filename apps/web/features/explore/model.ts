import { z } from "zod";
import { EVENT_TYPES, SUPPORTED_LOCALES, type EventType, type SupportedLocale } from "@happyroom/shared";
import { getCountry, REGIONS, type Region } from "./countries";

/**
 * Public discovery contract. A celebration appears here ONLY if its host explicitly opted in to
 * public discovery. Deliberately absent: slug, invitation tokens, access codes, honoree / host
 * names, exact coordinates. Location is the host-declared country only (globe = label point).
 */
export const publicCelebrationSchema = z.object({
  id: z.string().min(1).max(64),
  /** Host-written public name (not the private room title, which usually contains a person's name). */
  name: z.string().min(1).max(80),
  celebrationType: z.enum(EVENT_TYPES),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(SUPPORTED_LOCALES),
  status: z.enum(["live", "upcoming"]),
  startsAt: z.iso.datetime().nullable(),
  /** Only real, server-counted values. Null when unknown — never estimated. */
  participantCount: z.number().int().min(0).nullable(),
  capacity: z.number().int().min(1).nullable(),
});
export type PublicCelebration = z.infer<typeof publicCelebrationSchema>;

export const discoveryResponseSchema = z.object({
  /** "demo" = sample fixtures, clearly labelled, never mixed with real rooms. */
  mode: z.enum(["live", "demo"]),
  /** Whether hosts can currently opt in to public discovery at all. */
  discoveryEnabled: z.boolean(),
  demoAvailable: z.boolean(),
  celebrations: z.array(publicCelebrationSchema).max(500),
});
export type DiscoveryResponse = z.infer<typeof discoveryResponseSchema>;

export interface ExploreFilters {
  query: string;
  region: Region | "";
  country: string;
  language: SupportedLocale | "";
  type: EventType | "";
}

export const EMPTY_FILTERS: ExploreFilters = { query: "", region: "", country: "", language: "", type: "" };

export function hasActiveFilters(f: ExploreFilters): boolean {
  return Boolean(f.query.trim() || f.region || f.country || f.language || f.type);
}

/** Lower-case, accent-free text for forgiving search ("viet nam" finds "Việt Nam"). */
export function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function filterCelebrations(
  items: readonly PublicCelebration[],
  f: ExploreFilters,
  countryName: (code: string) => string,
): PublicCelebration[] {
  const q = fold(f.query);
  return items.filter((c) => {
    const country = getCountry(c.countryCode);
    if (f.region && country?.region !== f.region) return false;
    if (f.country && c.countryCode !== f.country) return false;
    if (f.language && c.language !== f.language) return false;
    if (f.type && c.celebrationType !== f.type) return false;
    if (!q) return true;
    return (
      fold(c.name).includes(q) ||
      fold(countryName(c.countryCode)).includes(q) ||
      fold(country?.name ?? "").includes(q) ||
      c.countryCode.toLowerCase() === q
    );
  });
}

export function sortCelebrations(items: readonly PublicCelebration[]): PublicCelebration[] {
  const rank = { live: 0, upcoming: 1 } as const;
  return [...items].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      (a.startsAt ?? "").localeCompare(b.startsAt ?? "") ||
      a.name.localeCompare(b.name),
  );
}

// ---------------------------------------------------------------------------------------------
// Clustering on the sphere

export interface Cluster {
  id: string;
  lat: number;
  lng: number;
  items: PublicCelebration[];
  countryCodes: string[];
}

const RAD = Math.PI / 180;

/** Great-circle distance in degrees. */
export function angularDistance(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const s =
    Math.sin(aLat * RAD) * Math.sin(bLat * RAD) +
    Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.cos((aLng - bLng) * RAD);
  return Math.acos(Math.min(1, Math.max(-1, s))) / RAD;
}

/**
 * Greedy clustering: celebrations whose countries lie within `thresholdDeg` of a cluster's seed
 * merge into it. Rooms in the same country always share a point (country-level location only).
 * Deterministic for a given input order.
 */
export function clusterCelebrations(items: readonly PublicCelebration[], thresholdDeg: number): Cluster[] {
  const clusters: Cluster[] = [];
  for (const item of items) {
    const country = getCountry(item.countryCode);
    if (!country) continue;
    const target = clusters.find(
      (c) => angularDistance(c.lat, c.lng, country.lat, country.lng) <= thresholdDeg,
    );
    if (target) {
      target.items.push(item);
      if (!target.countryCodes.includes(country.code)) target.countryCodes.push(country.code);
    } else {
      clusters.push({
        id: `c-${country.code}-${item.id}`,
        lat: country.lat,
        lng: country.lng,
        items: [item],
        countryCodes: [country.code],
      });
    }
  }
  // Centre multi-country clusters on their members so the marker sits between them.
  for (const c of clusters) {
    if (c.countryCodes.length < 2) continue;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const item of c.items) {
      const k = getCountry(item.countryCode)!;
      x += Math.cos(k.lat * RAD) * Math.cos(k.lng * RAD);
      y += Math.cos(k.lat * RAD) * Math.sin(k.lng * RAD);
      z += Math.sin(k.lat * RAD);
    }
    c.lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
    c.lng = Math.atan2(y, x) / RAD;
  }
  return clusters;
}

/** Cluster radius for a camera distance (globe radius = 1): wider when zoomed out. */
export function clusterThreshold(cameraDistance: number): number {
  return Math.min(14, Math.max(2.5, (cameraDistance - 1) * 3.6));
}

export { REGIONS };
