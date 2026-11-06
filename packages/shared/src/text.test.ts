import { describe, expect, it } from "vitest";
import {
  containsLink,
  graphemeLength,
  sanitizeMultiLine,
  sanitizeSingleLine,
  screenProfanity,
} from "./text.js";

describe("sanitizeSingleLine", () => {
  it("normalises to NFC so composed and decomposed Vietnamese compare equal", () => {
    const decomposed = "Nguyễn"; // e + circumflex + tilde
    expect(sanitizeSingleLine(decomposed)).toBe("Nguyễn");
  });

  it("strips control, bidi-override and zero-width characters", () => {
    expect(sanitizeSingleLine("Al\u0000ice‮​")).toBe("Al ice");
  });

  it("collapses whitespace and newlines", () => {
    expect(sanitizeSingleLine("  Happy \n\t birthday   ")).toBe("Happy birthday");
  });

  it("preserves Japanese text and emoji ZWJ sequences", () => {
    expect(sanitizeSingleLine("さくら 👩‍🍳")).toBe("さくら 👩‍🍳");
  });
});

describe("sanitizeMultiLine", () => {
  it("keeps paragraph breaks but limits them to two", () => {
    expect(sanitizeMultiLine("Line 1\r\n\n\n\nLine 2")).toBe("Line 1\n\nLine 2");
  });
});

describe("graphemeLength", () => {
  it("counts user-perceived characters", () => {
    expect(graphemeLength("👩‍🍳")).toBe(1);
    expect(graphemeLength("Nguyễn")).toBe(6);
    expect(graphemeLength("誕生日")).toBe(3);
  });
});

describe("screenProfanity", () => {
  it("blocks known slurs/profanity, case- and NFC-insensitively", () => {
    expect(screenProfanity("Happy birthday!")).toEqual({ ok: true, text: "Happy birthday!" });
    expect(screenProfanity("You FUCK")).toEqual({ ok: false });
    expect(screenProfanity("đụ")).toEqual({ ok: false });
  });
});

describe("containsLink", () => {
  it("flags URLs and bare domains but not ordinary text", () => {
    expect(containsLink("Happy birthday, have a great day!")).toBe(false);
    expect(containsLink("check https://evil.example")).toBe(true);
    expect(containsLink("visit www.example.com")).toBe(true);
    expect(containsLink("see example.com for more")).toBe(true);
  });
});
