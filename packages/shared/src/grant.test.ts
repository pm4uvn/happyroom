import { describe, expect, it } from "vitest";
import { signJoinGrant, verifyJoinGrant } from "./grant.js";

const secret = "x".repeat(32);
const claims = {
  roomId: "6f1c1a52-6b2b-4d8e-9a43-2a1f6d2d9e10",
  participantId: "7a1c1a52-6b2b-4d8e-9a43-2a1f6d2d9e11",
  role: "guest" as const,
  displayName: "Mai",
  avatar: "mint" as const,
};

describe("join grants", () => {
  it("round-trips a valid grant", () => {
    const t = signJoinGrant(claims, secret, 60, 1_000_000);
    const r = verifyJoinGrant(t, secret, 1_000_000 + 1000);
    expect(r.ok && r.payload).toMatchObject({ ...claims, aud: "happyroom-game" });
  });

  it("rejects expired grants", () => {
    const t = signJoinGrant(claims, secret, 60, 1_000_000);
    expect(verifyJoinGrant(t, secret, 1_000_000 + 61_000)).toEqual({ ok: false, error: "expired" });
  });

  it("rejects tampered payloads (e.g. role escalation)", () => {
    const t = signJoinGrant(claims, secret, 60);
    const [body, sig] = t.split(".");
    const payload = JSON.parse(Buffer.from(body!, "base64url").toString());
    payload.role = "host";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    expect(verifyJoinGrant(forged, secret)).toEqual({ ok: false, error: "bad_signature" });
  });

  it("rejects grants signed with another key", () => {
    const t = signJoinGrant(claims, "y".repeat(32), 60);
    expect(verifyJoinGrant(t, secret)).toEqual({ ok: false, error: "bad_signature" });
  });

  it("rejects malformed tokens", () => {
    expect(verifyJoinGrant("nope", secret)).toEqual({ ok: false, error: "malformed" });
  });

  it("refuses weak keys", () => {
    expect(() => signJoinGrant(claims, "short", 60)).toThrow();
  });
});

describe("world grants", () => {
  const w = {
    profileId: claims.participantId,
    displayName: "Mai",
    avatar: "sky" as const,
    ageBand: "adult" as const,
    chatEnabled: true,
    zoneId: "central_plaza",
  };
  it("round-trips and is not interchangeable with party grants", async () => {
    const { signWorldGrant, verifyWorldGrant } = await import("./grant.js");
    const t = signWorldGrant(w, secret, 60);
    expect(verifyWorldGrant(t, secret)).toMatchObject({ ok: true, payload: { zoneId: "central_plaza" } });
    // A party grant has a different audience → invalid as a world grant (and vice versa).
    expect(verifyWorldGrant(signJoinGrant(claims, secret, 60), secret)).toEqual({
      ok: false,
      error: "invalid_payload",
    });
    expect(verifyJoinGrant(t, secret)).toEqual({ ok: false, error: "invalid_payload" });
  });
});
