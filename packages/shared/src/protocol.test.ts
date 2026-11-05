import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./protocol.js";

describe("parseClientMessage", () => {
  it("rejects non-finite coordinates", () => {
    expect(parseClientMessage("move", { seq: 1, x: Infinity, z: 0, rotY: 0, moving: true }).success).toBe(
      false,
    );
  });
  it("sanitises chat text", () => {
    const r = parseClientMessage("chat", { text: "  hi‮  there " });
    expect(r.success && r.data.text).toBe("hi there");
  });
  it("normalises empty gift messages to undefined", () => {
    const r = parseClientMessage("gift", {
      catalogId: "star",
      message: "   ",
      idempotencyKey: "6f1c1a52-6b2b-4d8e-9a43-2a1f6d2d9e10",
    });
    expect(r.success && r.data.message).toBeUndefined();
  });
});
