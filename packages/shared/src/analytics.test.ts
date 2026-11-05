import { describe, expect, it } from "vitest";
import { parseAnalyticsEvent } from "./analytics.js";

const now = new Date().toISOString();

describe("parseAnalyticsEvent", () => {
  it("accepts a landing_view without identifiers", () => {
    const r = parseAnalyticsEvent({ name: "landing_view", occurredAt: now, properties: {} });
    expect(r.success).toBe(true);
  });

  it("rejects unknown event names", () => {
    expect(parseAnalyticsEvent({ name: "user_email", occurredAt: now, properties: {} }).success).toBe(false);
  });

  it("rejects unknown property keys so PII cannot slip in", () => {
    const r = parseAnalyticsEvent({
      name: "landing_view",
      occurredAt: now,
      properties: { email: "someone@example.com" },
    });
    expect(r.success).toBe(false);
  });

  it("validates per-event property types", () => {
    const r = parseAnalyticsEvent({
      name: "gift_sent",
      occurredAt: now,
      properties: { roomId: "not-a-uuid", catalogId: "star" },
    });
    expect(r.success).toBe(false);
  });
});
