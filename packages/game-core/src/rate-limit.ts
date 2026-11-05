/**
 * In-memory token bucket used by the game server for per-participant action limits.
 * Limits that must hold across processes (room creation, invitations) need a shared store;
 * the Redis-backed equivalent is backlog item M2-05 (docs/ROADMAP.md).
 */
export interface BucketConfig {
  points: number;
  windowSeconds: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly config: BucketConfig,
    private readonly maxKeys = 10_000,
  ) {}

  /** Try to consume `cost` tokens for `key` at time `now` (ms). */
  consume(key: string, now: number, cost = 1): { allowed: boolean; retryAfterMs: number } {
    const ratePerMs = this.config.points / (this.config.windowSeconds * 1000);
    const existing = this.buckets.get(key);
    const bucket: Bucket = existing ?? { tokens: this.config.points, updatedAt: now };
    const elapsed = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(this.config.points, bucket.tokens + elapsed * ratePerMs);
    bucket.updatedAt = now;

    if (!existing) {
      if (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      this.buckets.set(key, bucket);
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, retryAfterMs: 0 };
    }
    return { allowed: false, retryAfterMs: Math.ceil((cost - bucket.tokens) / ratePerMs) };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}
