import "server-only";
import { createHash } from "node:crypto";
import { TokenBucketLimiter } from "@happyroom/game-core";
import { RATE_LIMITS, type RateLimitName } from "@happyroom/shared";

/**
 * Process-local rate limiting. Correct for a single web instance; a multi-instance deployment
 * needs the Redis-backed limiter (backlog M2-05) so limits are shared across processes.
 */
const limiters = new Map<RateLimitName, TokenBucketLimiter>();

function limiter(name: RateLimitName) {
  let l = limiters.get(name);
  if (!l) {
    l = new TokenBucketLimiter(RATE_LIMITS[name]);
    limiters.set(name, l);
  }
  return l;
}

/** Keys are hashed so raw IP addresses are never kept in memory dumps or logs. */
export function clientKey(headers: Headers): string {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("base64url").slice(0, 22);
}

export function rateLimit(name: RateLimitName, key: string) {
  return limiter(name).consume(key, Date.now());
}
