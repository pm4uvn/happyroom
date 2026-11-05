import { describe, expect, it } from "vitest";
import { TokenBucketLimiter } from "./rate-limit.js";

describe("TokenBucketLimiter", () => {
  it("allows a burst up to the bucket size then refills over time", () => {
    const l = new TokenBucketLimiter({ points: 3, windowSeconds: 3 });
    expect(l.consume("a", 0).allowed).toBe(true);
    expect(l.consume("a", 0).allowed).toBe(true);
    expect(l.consume("a", 0).allowed).toBe(true);
    const denied = l.consume("a", 0);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1000);
    expect(l.consume("a", 1000).allowed).toBe(true);
  });

  it("isolates keys", () => {
    const l = new TokenBucketLimiter({ points: 1, windowSeconds: 60 });
    expect(l.consume("a", 0).allowed).toBe(true);
    expect(l.consume("b", 0).allowed).toBe(true);
    expect(l.consume("a", 0).allowed).toBe(false);
  });

  it("evicts the oldest key when the key cap is reached", () => {
    const l = new TokenBucketLimiter({ points: 1, windowSeconds: 60 }, 2);
    l.consume("a", 0);
    l.consume("b", 0);
    l.consume("c", 0); // evicts "a"
    expect(l.consume("a", 0).allowed).toBe(true);
  });
});
