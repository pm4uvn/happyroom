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
// Decouple from the real game server: unit tests never make a network call to it.
vi.mock("@/lib/server/presence", () => ({ getPresence: async () => ({ ok: false as const }) }));

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
  intro: null,
  acceptingWishes: false,
  ...over,
});

// A tagged-template stub standing in for the real `Db`: every query resolves to an empty result
// set, which is exactly what "no room has opted in yet" looks like.
const emptyDb = (() => Promise.resolve([])) as unknown as import("@/lib/server/types").Db;

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
      expect(Number.isInteger(c.labelRank)).toBe(true);
      expect(c.labelRank).toBeGreaterThanOrEqual(1);
    }
    // Major, populous countries must outrank tiny territories (lower rank = shown first).
    expect(getCountry("US")!.labelRank).toBeLessThan(getCountry("MC")!.labelRank);
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

  it("is honestly empty while no room has opted in to public discovery", async () => {
    const { getDiscovery } = await import("@/lib/server/discovery");
    const live = await getDiscovery(emptyDb, { demo: false });
    expect(discoveryResponseSchema.parse(live)).toMatchObject({
      mode: "live",
      discoveryEnabled: true,
      celebrations: [],
    });
  });

  it("serves labelled demo fixtures without invented participant counts", async () => {
    const { getDiscovery } = await import("@/lib/server/discovery");
    const demo = discoveryResponseSchema.parse(await getDiscovery(emptyDb, { demo: true }));
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
    expect((await getDiscovery(emptyDb, { demo: true })).mode).toBe("live");
    vi.stubEnv("EXPLORE_DEMO_ENABLED", "true");
    expect((await getDiscovery(emptyDb, { demo: true })).mode).toBe("demo");
  });
});

describe("explore summary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports zero (not unavailable) when no room is live, and marks presence-dependent metrics unavailable when the game server cannot be reached", async () => {
    const { getExploreSummary } = await import("@/lib/server/discovery");
    const summary = await getExploreSummary(emptyDb, { demo: false });
    // getPresence() is mocked to { ok: false } above, matching "game server unreachable": the
    // three presence-derived metrics must say so rather than report a faked zero.
    expect(summary.celebratingNow).toEqual({ value: null, status: "unavailable" });
    expect(summary.peopleCelebrating).toEqual({ value: null, status: "unavailable" });
    expect(summary.countriesCelebrating).toEqual({ value: null, status: "unavailable" });
    // wishesShared comes from the database alone, independent of game-server presence.
    expect(summary.wishesShared).toEqual({ value: 0, status: "ok" });
  });

  it("computes the demo summary from demo fixtures only, never mixed with real data", async () => {
    const { getExploreSummary } = await import("@/lib/server/discovery");
    const summary = await getExploreSummary(emptyDb, { demo: true });
    expect(summary.mode).toBe("demo");
    expect(summary.celebratingNow.status).toBe("ok");
    expect(summary.celebratingNow.value).toBeGreaterThan(0);
  });
});

describe("country name labels on the globe", () => {
  it("prioritises the selected country above everything else", async () => {
    const { buildCandidates } = await import("./globe/country-labels");
    const candidates = buildCandidates([], "MC"); // Monaco: a tiny, low-rank territory
    expect(candidates[0]!.code).toBe("MC");
    expect(candidates[0]!.bypassRank).toBe(true);
  });

  it("prioritises countries with a live celebration over ones with only an upcoming one, and both over plain rank", async () => {
    const { buildCandidates } = await import("./globe/country-labels");
    const items = [
      room({ id: "1", countryCode: "MC", status: "upcoming", startsAt: "2026-01-01T00:00:00.000Z" }),
      room({ id: "2", countryCode: "VN", status: "live" }),
    ];
    const candidates = buildCandidates(items, "");
    const rank = (code: string) => candidates.findIndex((c) => c.code === code);
    expect(rank("VN")).toBeLessThan(rank("MC")); // live beats upcoming
    expect(rank("MC")).toBeLessThan(rank("US")); // upcoming (bypasses rank) still beats a plain major country
    for (const c of ["VN", "MC"]) expect(candidates.find((x) => x.code === c)!.bypassRank).toBe(true);
    expect(candidates.find((c) => c.code === "US")!.bypassRank).toBe(false);
  });

  it("never invents a country that isn't in the data", async () => {
    const { buildCandidates } = await import("./globe/country-labels");
    const candidates = buildCandidates([], "");
    expect(candidates).toHaveLength(COUNTRIES.length);
    expect(new Set(candidates.map((c) => c.code)).size).toBe(COUNTRIES.length);
  });

  it("shows more labels, and admits smaller countries, as the camera moves in", async () => {
    const { labelBudget, maxRankForDistance } = await import("./globe/country-labels");
    const { MIN_DISTANCE, MAX_DISTANCE } = await import("./globe/camera-rig");
    expect(labelBudget(MAX_DISTANCE, false)).toBeLessThan(labelBudget(MIN_DISTANCE, false));
    expect(maxRankForDistance(MAX_DISTANCE)).toBeLessThan(maxRankForDistance(MIN_DISTANCE));
    // Mobile shows fewer labels at the same distance.
    expect(labelBudget(MIN_DISTANCE, true)).toBeLessThan(labelBudget(MIN_DISTANCE, false));
  });

  it("projectLatLng hides the back of the globe and matches the marker projector's facing test", async () => {
    const THREE = await import("three");
    const { projectLatLng, FACING_LIMIT } = await import("./globe/project");
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const size = { width: 800, height: 600 };
    const scratch = new THREE.Vector3();
    // Facing the camera directly (lng 0 at the camera's longitude on this sphere convention).
    const front = projectLatLng(0, -90, camera, size, scratch);
    expect(front).not.toBeNull();
    expect(front!.x).toBeCloseTo(size.width / 2, 0);
    // The antipodal point is on the far side of the globe and must never project.
    const back = projectLatLng(0, 90, camera, size, scratch);
    expect(back).toBeNull();
    expect(FACING_LIMIT).toBeGreaterThan(0);
  });
});
