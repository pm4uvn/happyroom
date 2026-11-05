import { describe, expect, it } from "vitest";
import { redact } from "./logger";

describe("redact", () => {
  it("masks secret-looking keys at any depth", () => {
    expect(
      redact({
        roomId: "r1",
        invitationToken: "abc",
        nested: { accessCode: "CAKE", Authorization: "Bearer x", ok: 1 },
        list: [{ grant: "g" }],
      }),
    ).toEqual({
      roomId: "r1",
      invitationToken: "[redacted]",
      nested: { accessCode: "[redacted]", Authorization: "[redacted]", ok: 1 },
      list: [{ grant: "[redacted]" }],
    });
  });

  it("serialises errors without stack traces", () => {
    expect(redact({ err: new Error("boom") })).toEqual({ err: { name: "Error", message: "boom" } });
  });
});
