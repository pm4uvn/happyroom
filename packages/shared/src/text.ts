/**
 * User-generated text handling.
 *
 * HAPPYROOM stores UGC as *plain text* and never renders it as HTML (React escapes on output,
 * the 3D name tags render text via canvas/SDF). Sanitisation therefore focuses on:
 *  - Unicode normalisation (NFC) so visually identical names compare equal
 *  - removing control characters and bidi-override characters used for spoofing
 *  - removing invisible zero-width characters from single-line fields
 *  - collapsing whitespace
 *  - counting length in user-perceived characters (grapheme clusters), so emoji and
 *    combining marks (Vietnamese diacritics, Japanese) are measured fairly.
 */

// C0/C1 controls except TAB (\u0009) and LF (\u000A).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Bidi embedding/override/isolate controls (Trojan-source style spoofing).
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;
// Zero-width and other invisible formatting characters. ZWJ (U+200D) is preserved because
// it is required for composed emoji sequences (e.g. family / profession emoji).
const INVISIBLES = /[\u200B\u200C\u2060\uFEFF\u00AD\u180E]/g;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

/** Number of user-perceived characters (grapheme clusters). */
export function graphemeLength(value: string): number {
  if (!segmenter) return Array.from(value).length;
  let count = 0;
  for (const _ of segmenter.segment(value)) count++;
  return count;
}

/** Sanitise a single-line field such as a display name or room title. */
export function sanitizeSingleLine(value: string): string {
  return value
    .normalize("NFC")
    .replace(CONTROL_CHARS, " ")
    .replace(BIDI_CONTROLS, "")
    .replace(INVISIBLES, "")
    .replace(/[\t\n\r]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Sanitise a multi-line field such as a wish. Keeps at most 2 consecutive line breaks. */
export function sanitizeMultiLine(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, " ")
    .replace(BIDI_CONTROLS, "")
    .replace(INVISIBLES, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
