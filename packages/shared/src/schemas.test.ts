import { describe, expect, it } from "vitest";
import { createRoomInputSchema, displayNameSchema, accessCodeSchema } from "./schemas.js";

const base = {
  eventType: "birthday",
  honoreeName: "Mai",
  hostDisplayName: "Sang",
  themeId: "cozy_twilight",
  cakeStyle: "berry_dream",
  decoration: "balloons_pastel",
  start: { mode: "now" },
  timeZone: "Asia/Ho_Chi_Minh",
  privacy: "invite_link",
  locale: "vi",
} as const;

describe("displayNameSchema", () => {
  it("rejects empty-after-sanitisation names", () => {
    expect(displayNameSchema.safeParse("​ ‮").success).toBe(false);
  });
  it("rejects names longer than the grapheme limit", () => {
    expect(displayNameSchema.safeParse("a".repeat(33)).success).toBe(false);
  });
  it("accepts 32 emoji (grapheme-counted)", () => {
    expect(displayNameSchema.safeParse("🎉".repeat(32)).success).toBe(true);
  });
});

describe("accessCodeSchema", () => {
  it("upper-cases and trims", () => {
    expect(accessCodeSchema.parse(" cake42 ")).toBe("CAKE42");
  });
  it("rejects symbols", () => {
    expect(accessCodeSchema.safeParse("ca-ke").success).toBe(false);
  });
});

describe("createRoomInputSchema", () => {
  it("accepts a valid start-now birthday room", () => {
    expect(createRoomInputSchema.safeParse(base).success).toBe(true);
  });
  it("rejects event types that are not yet enabled", () => {
    expect(createRoomInputSchema.safeParse({ ...base, eventType: "wedding" }).success).toBe(false);
  });
  it("requires an access code for access_code privacy", () => {
    const r = createRoomInputSchema.safeParse({ ...base, privacy: "access_code" });
    expect(r.success).toBe(false);
  });
  it("rejects invalid IANA timezones", () => {
    expect(createRoomInputSchema.safeParse({ ...base, timeZone: "Mars/Olympus" }).success).toBe(false);
  });
  it("rejects scheduled times in the past", () => {
    const r = createRoomInputSchema.safeParse({
      ...base,
      start: { mode: "scheduled", startsAt: "2000-01-01T00:00:00Z" },
    });
    expect(r.success).toBe(false);
  });
});
