import { describe, expect, it } from "vitest";
import { parseInviteInput } from "./parse-invite";

const token = "AbCdEfGhIjKlMnOpQrStUvWxYz012345_-xyz";

describe("parseInviteInput", () => {
  it("accepts a bare room code (case-insensitive)", () => {
    expect(parseInviteInput("  K7M2P9QX ")).toEqual({ slug: "k7m2p9qx" });
  });
  it("extracts slug and invitation token from a full link", () => {
    expect(parseInviteInput(`https://happyroom.app/r/k7m2p9qx?i=${token}`)).toEqual({
      slug: "k7m2p9qx",
      token,
    });
  });
  it("accepts links without a scheme", () => {
    expect(parseInviteInput(`happyroom.app/r/k7m2p9qx?i=${token}`)).toEqual({ slug: "k7m2p9qx", token });
  });
  it("drops malformed tokens but keeps the room", () => {
    expect(parseInviteInput("https://x.app/r/k7m2p9qx?i=<script>")).toEqual({ slug: "k7m2p9qx" });
  });
  it("rejects unrelated input", () => {
    expect(parseInviteInput("hello world")).toBeNull();
    expect(parseInviteInput("https://example.com/other/page")).toBeNull();
    expect(parseInviteInput("")).toBeNull();
  });
});
