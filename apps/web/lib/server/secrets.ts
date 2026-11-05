import "server-only";
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  keylen: number,
  opts: object,
) => Promise<Buffer>;

/** URL-safe random secret (default 32 bytes = 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Unambiguous lowercase alphabet (no 0/o, 1/l/i) for codes people read aloud or type. */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomCode(length: number, alphabet = CODE_ALPHABET): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Room code / slug, e.g. "k7m2p9qx". Display identifier only — never an authorisation secret. */
export function newRoomSlug(): string {
  return randomCode(8);
}

/** Host recovery code, e.g. "HR-7K2M-9QXP-4TAB" (≈ 80 bits). Shown once; only its hash is stored. */
export function newRecoveryCode(): string {
  const alpha = CODE_ALPHABET.toUpperCase();
  return `HR-${randomCode(4, alpha)}-${randomCode(4, alpha)}-${randomCode(4, alpha)}-${randomCode(4, alpha)}`;
}

export function normalizeRecoveryCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** Access codes are short, so they are hashed with scrypt (slow) and attempts are rate-limited. */
export async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(code, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(code, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
