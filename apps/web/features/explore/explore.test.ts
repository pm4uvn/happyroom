import { afterEach, describe, expect, it, vi } from "vitest";
import { COUNTRIES, countryName, getCountry, REGIONS } from "./countries";
import { decode, latLngToXYZ, xyzToLatLng } from "./globe/geo";
import {
  angularDistance,
  clusterCelebrations,
  clusterThreshold,
  discoveryResponseSchema,
  EMPTY_FILTERS,
  filterCelebrations,
  fold,
  publicCelebrationSchema,
  sortCelebrations,
  type PublicCelebration,
} from "./model";

vi.mock("server-only", () => ({}));

const room = (over: Partial<PublicCelebration>): PublicCelebration => ({
  id: over.id ?? "r1",
  name: "Lantern Night",
  celebrationType: "birthday",
  countryCode: "VN",
  language: "vi",
  status: "live",
  startsAt: null,
  participantCount: null,
  capacity: null,
  ...over,
});

const name = (code: string) => countryName(code, "en");

describe("countries", () => {
  it("covers every ISO country with a region and a label point", () => {
    expect(COUNTRIES.length).toBeGreaterThan(230);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(REGIONS).toContain(c.region);
      expect(Math.abs(c.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(c.lng)).toBeLessThanOrEqual(180);
    }
    expect(getCountry("VN")).toMatchObject({ region: "Asia" });
    expect(getCountry("FR")).toMatchObject({ region: "Europe" });
  });

  it("localises names with Intl and falls back to English", () => {
    expect(countryName("JP", "en")).toBe("Japan");
    expect(countryName("JP", "ja")).toBe("日本");
    expect(countryName("VN", "vi")).toBe("Việt Nam");
  });
});

describe("filters", () => {
  const items = [
    room({ id: "a", name: "Lantern Night", countryCode: "VN", language: "vi" }),
    room({ id: "b", name: "Sakura Party", countryCode: "JP", language: "ja", celebrationType: "graduation" }),
    room({ id: "c", name: "Paris Wedding", countryCode: "FR", language: "en", celebrationType: "wedding" }),
  ];

  it("searches names and country names, accent-insensitive", () => {
    expect(fold("Việt Nam")).toBe("viet nam");
    const by = (query: string, n = name) =>
      filterCelebrations(items, { ...EMPTY_FILTERS, query }, n).map((i) => i.id);
    expect(by("sakura")).toEqual(["b"]);
    expect(by("france")).toEqual(["c"]);
    expect(by("viet nam", (c) => countryName(c, "vi"))).toEqual(["a"]);
    expect(by("jp")).toEqual(["b"]);
  });

  it("filters by region, country, language and type", () => {
    const f = (patch: Partial<typeof EMPTY_FILTERS>) =>
      filterCelebrations(items, { ...EMPTY_FILTERS, ...patch }, name).map((i) => i.id);
    expect(f({ region: "Asia" })).toEqual(["a", "b"]);
    expect(f({ region: "Europe" })).toEqual(["c"]);
    expect(f({ country: "JP" })).toEqual(["b"]);
    expect(f({ language: "en" })).toEqual(["c"]);
    expect(f({ type: "wedding" })).toEqual(["c"]);
    expect(f({ region: "Africa" })).toEqual([]);
  });

  it("sorts live first, then by start time", () => {
    const sorted = sortCelebrations([
      room({ id: "late", status: "upcoming", startsAt: "2026-11-07T10:00:00.000Z" }),
      room({ id: "soon", status: "upcoming", startsAt: "2026-11-06T10:00:00.000Z" }),
      room({ id: "now", status: "live" }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["now", "soon", "late"]);
  });
});

describe("clustering", () => {
  it("merges nearby countries when zoomed out and splits them when zoomed in", () => {
    const items = [
      room({ id: "be", countryCode: "BE" }),
      room({ id: "nl", countryCode: "NL" }),
      room({ id: "jp", countryCode: "JP" }),
    ];
    const far = clusterCelebrations(items, clusterThreshold(4.2));
    expect(far).toHaveLength(2);
    expect(far.find((c) => c.items.length === 2)?.countryCodes.sort()).toEqual(["BE", "NL"]);
    const near = clusterCelebrations(items, 1);
    expect(near).toHaveLength(3);
  });

  it("always groups rooms of the same country at one point (country-level location only)", () => {
    const clusters = clusterCelebrations([room({ id: "1" }), room({ id: "2" })], 0.1);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.items).toHaveLength(2);
    const vn = getCountry("VN")!;
    expect([clusters[0]!.lat, clusters[0]!.lng]).toEqual([vn.lat, vn.lng]);
  });

  it("measures great-circle distance", () => {
    expect(angularDistance(0, 0, 0, 90)).toBeCloseTo(90);
    expect(angularDistance(0, 179, 0, -179)).toBeCloseTo(2);
  });
});

describe("globe geometry", () => {
  it("maps lat/lng to the sphere and back", () => {
    for (const [lat, lng] of [
      [0, 0],
      [21, 105.8],
      [-33.9, 151.2],
      [64, -150],
      [-80, 170],
    ] as const) {
      const [x, y, z] = latLngToXYZ(lat, lng);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
      const back = xyzToLatLng(x, y, z);
      expect(back.lat).toBeCloseTo(lat, 6);
      expect(back.lng).toBeCloseTo(lng, 6);
    }
  });

  it("matches three.js sphere UVs (u = 0 at -180°, north up)", () => {
    // three.js SphereGeometry: u=0.25 → phi=π/2 → (x≈0, z=+1).
    const [x, , z] = latLngToXYZ(0, -90);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(1);
    expect(latLngToXYZ(90, 0)[1]).toBeCloseTo(1);
  });

  it("decodes delta-encoded outlines", () => {
    expect(decode({ v: 1, unit: 0.01, delta: true, items: [[100, 200, 50, -100]] })).toEqual([
      [
        [1, 2],
        [1.5, 1],
      ],
    ]);
  });
});

describe("public discovery contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never carries private fields", () => {
    const keys = Object.keys(publicCelebrationSchema.shape);
    for (const forbidden of ["slug", "inviteToken", "accessCode", "honoreeName", "hostName", "lat", "lng"]) {
      expect(keys).not.toContain(forbidden);
    }
    // Unknown fields are stripped, so a leak cannot pass through validation.
    const parsed = publicCelebrationSchema.parse({ ...room({}), slug: "secret-slug", accessCode: "123456" });
    expect(parsed).not.toHaveProperty("slug");
    expect(parsed).not.toHaveProperty("accessCode");
  });

  it("is honestly empty while host opt-in discovery does not exist", async () => {
    const { getDiscovery } = await import("@/lib/server/discovery");
    const live = await getDiscovery({ demo: false });
    expect(discoveryResponseSchema.parse(live)).toMatchObject({
      mode: "live",
      discoveryEnabled: false,
      celebrations: [],
    });
  });

  it("serves labelled demo fixtures without invented participant counts", async () => {
    const { getDiscovery } = await import("@/lib/server/discovery");
    const demo = discoveryResponseSchema.parse(await getDiscovery({ demo: true }));
    expect(demo.mode).toBe("demo");
    expect(demo.celebrations.length).toBeGreaterThan(10);
    for (const c of demo.celebrations) {
      expect(c.id).toMatch(/^demo-/);
      expect(c.participantCount).toBeNull();
      expect(getCountry(c.countryCode)).toBeDefined();
    }
  });

  it("refuses demo mode in production unless explicitly enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getDiscovery } = await import("@/lib/server/discovery");
    expect((await getDiscovery({ demo: true })).mode).toBe("live");
    vi.stubEnv("EXPLORE_DEMO_ENABLED", "true");
    expect((await getDiscovery({ demo: true })).mode).toBe("demo");
  });
});
