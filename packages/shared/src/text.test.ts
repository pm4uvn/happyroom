import { describe, expect, it } from "vitest";
import { graphemeLength, sanitizeMultiLine, sanitizeSingleLine } from "./text.js";

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
