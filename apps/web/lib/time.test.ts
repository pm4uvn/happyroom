import { describe, expect, it } from "vitest";
import { zonedLocalToUtcIso } from "./time";

describe("zonedLocalToUtcIso", () => {
  it("converts fixed-offset zones", () => {
    expect(zonedLocalToUtcIso("2027-03-10T19:30", "Asia/Ho_Chi_Minh")).toBe("2027-03-10T12:30:00.000Z");
    expect(zonedLocalToUtcIso("2027-03-10T19:30", "Asia/Tokyo")).toBe("2027-03-10T10:30:00.000Z");
  });
  it("handles daylight saving time", () => {
    expect(zonedLocalToUtcIso("2027-01-15T18:00", "America/New_York")).toBe("2027-01-15T23:00:00.000Z");
    expect(zonedLocalToUtcIso("2027-07-15T18:00", "America/New_York")).toBe("2027-07-15T22:00:00.000Z");
  });
  it("rejects malformed input", () => {
    expect(zonedLocalToUtcIso("tomorrow", "UTC")).toBeNull();
  });
});
