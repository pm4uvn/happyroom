import raw from "./data/countries.json";

/**
 * Every ISO 3166-1 country/territory from Natural Earth 1:50m (public domain): UN region and the
 * label point used to place a celebration on the globe. Regenerate with `scripts/geo-build.mjs`.
 */
export interface Country {
  code: string;
  name: string;
  region: Region;
  subregion: string;
  lat: number;
  lng: number;
}

export const REGIONS = ["Africa", "Americas", "Asia", "Europe", "Oceania", "Antarctica"] as const;
export type Region = (typeof REGIONS)[number];

export const COUNTRIES = raw as Country[];
const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));

export function getCountry(code: string): Country | undefined {
  return byCode.get(code);
}

/** Where the camera looks when a region is chosen. */
export const REGION_FOCUS: Record<Region, { lat: number; lng: number }> = {
  Africa: { lat: 4, lng: 20 },
  Americas: { lat: 12, lng: -80 },
  Asia: { lat: 30, lng: 95 },
  Europe: { lat: 50, lng: 14 },
  Oceania: { lat: -22, lng: 145 },
  Antarctica: { lat: -78, lng: 20 },
};

const displayNames = new Map<string, Intl.DisplayNames | null>();

/** Localised country name (Intl), falling back to the English Natural Earth name. */
export function countryName(code: string, locale: string): string {
  let dn = displayNames.get(locale);
  if (dn === undefined) {
    try {
      dn = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    } catch {
      dn = null;
    }
    displayNames.set(locale, dn);
  }
  return dn?.of(code) ?? byCode.get(code)?.name ?? code;
}
