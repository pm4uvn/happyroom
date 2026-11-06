import "server-only";
import type { PublicCelebration } from "@/features/explore/model";

/**
 * DEMO CELEBRATIONS — sample data for previewing the Explore dashboard. Not real rooms:
 * served only with `?demo=1`, always labelled "Demo" in the UI, never joinable, never mixed with
 * real discovery results, and disabled in production unless EXPLORE_DEMO_ENABLED=true.
 * No participant counts are invented (participantCount = null).
 */
type Fixture = Omit<PublicCelebration, "id" | "startsAt" | "participantCount" | "capacity"> & {
  /** Hours from now for upcoming ones. */
  inHours?: number;
};

const FIXTURES: Fixture[] = [
  {
    name: "Lantern Night Birthday",
    celebrationType: "birthday",
    countryCode: "VN",
    language: "vi",
    status: "live",
  },
  {
    name: "Tiệc sinh nhật bên bờ biển",
    celebrationType: "birthday",
    countryCode: "VN",
    language: "vi",
    status: "upcoming",
    inHours: 5,
  },
  {
    name: "Sakura Garden Party",
    celebrationType: "birthday",
    countryCode: "JP",
    language: "ja",
    status: "live",
  },
  {
    name: "卒業おめでとう会",
    celebrationType: "graduation",
    countryCode: "JP",
    language: "ja",
    status: "upcoming",
    inHours: 26,
  },
  {
    name: "Seoul Rooftop Anniversary",
    celebrationType: "anniversary",
    countryCode: "KR",
    language: "en",
    status: "upcoming",
    inHours: 9,
  },
  {
    name: "Manila Karaoke Birthday",
    celebrationType: "birthday",
    countryCode: "PH",
    language: "en",
    status: "live",
  },
  {
    name: "Bangkok Night Market Bash",
    celebrationType: "birthday",
    countryCode: "TH",
    language: "en",
    status: "upcoming",
    inHours: 3,
  },
  {
    name: "Marina Bay Team Celebration",
    celebrationType: "corporate",
    countryCode: "SG",
    language: "en",
    status: "upcoming",
    inHours: 30,
  },
  {
    name: "Diwali Birthday Lights",
    celebrationType: "birthday",
    countryCode: "IN",
    language: "en",
    status: "live",
  },
  {
    name: "Harbour Sunset Wedding Toast",
    celebrationType: "wedding",
    countryCode: "AU",
    language: "en",
    status: "upcoming",
    inHours: 14,
  },
  {
    name: "Southern Lights Graduation",
    celebrationType: "graduation",
    countryCode: "NZ",
    language: "en",
    status: "upcoming",
    inHours: 40,
  },
  {
    name: "Nile Breeze Birthday",
    celebrationType: "birthday",
    countryCode: "EG",
    language: "en",
    status: "upcoming",
    inHours: 7,
  },
  {
    name: "Afrobeats Birthday Jam",
    celebrationType: "birthday",
    countryCode: "NG",
    language: "en",
    status: "live",
  },
  {
    name: "Savannah Graduation Party",
    celebrationType: "graduation",
    countryCode: "KE",
    language: "en",
    status: "upcoming",
    inHours: 20,
  },
  {
    name: "Table Mountain Anniversary",
    celebrationType: "anniversary",
    countryCode: "ZA",
    language: "en",
    status: "upcoming",
    inHours: 50,
  },
  {
    name: "London Fog Birthday",
    celebrationType: "birthday",
    countryCode: "GB",
    language: "en",
    status: "live",
  },
  {
    name: "Canal Lights Graduation",
    celebrationType: "graduation",
    countryCode: "NL",
    language: "en",
    status: "upcoming",
    inHours: 11,
  },
  {
    name: "Brussels Waffle Birthday",
    celebrationType: "birthday",
    countryCode: "BE",
    language: "en",
    status: "upcoming",
    inHours: 4,
  },
  {
    name: "Parisian Garden Wedding",
    celebrationType: "wedding",
    countryCode: "FR",
    language: "en",
    status: "upcoming",
    inHours: 28,
  },
  {
    name: "Berlin Studio Team Party",
    celebrationType: "corporate",
    countryCode: "DE",
    language: "en",
    status: "live",
  },
  {
    name: "Lisbon Tram Birthday",
    celebrationType: "birthday",
    countryCode: "PT",
    language: "en",
    status: "upcoming",
    inHours: 16,
  },
  {
    name: "New York Skyline Birthday",
    celebrationType: "birthday",
    countryCode: "US",
    language: "en",
    status: "live",
  },
  {
    name: "Golden Hour Anniversary",
    celebrationType: "anniversary",
    countryCode: "US",
    language: "en",
    status: "upcoming",
    inHours: 22,
  },
  {
    name: "Maple Leaf Graduation",
    celebrationType: "graduation",
    countryCode: "CA",
    language: "en",
    status: "upcoming",
    inHours: 35,
  },
  {
    name: "Fiesta de Cumpleaños CDMX",
    celebrationType: "birthday",
    countryCode: "MX",
    language: "en",
    status: "live",
  },
  {
    name: "Carnival Colors Birthday",
    celebrationType: "birthday",
    countryCode: "BR",
    language: "en",
    status: "upcoming",
    inHours: 6,
  },
  {
    name: "Tango Night Anniversary",
    celebrationType: "anniversary",
    countryCode: "AR",
    language: "en",
    status: "upcoming",
    inHours: 45,
  },
];

export function demoCelebrations(now = new Date()): PublicCelebration[] {
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  return FIXTURES.map(({ inHours, ...f }, i) => ({
    ...f,
    id: `demo-${i + 1}`,
    startsAt: inHours ? new Date(hour.getTime() + inHours * 3_600_000).toISOString() : null,
    participantCount: null,
    capacity: null,
  }));
}
