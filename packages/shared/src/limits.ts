/** Product limits. Enforced on the server; mirrored on the client only for UX. */
export const LIMITS = {
  displayNameMaxChars: 32,
  honoreeNameMaxChars: 40,
  roomTitleMaxChars: 60,
  chatMessageMaxChars: 280,
  wishMaxChars: 500,
  /** Shorter cap for wishes sent from the public Explore dashboard (not the 3D room). */
  publicWishMaxChars: 220,
  publicNameMaxChars: 80,
  publicIntroMaxChars: 280,
  giftMessageMaxChars: 200,
  accessCodeMinChars: 4,
  accessCodeMaxChars: 12,
  roomCapacityDefault: 20,
  roomCapacityMax: 20,
  mediaMaxBytes: 8 * 1024 * 1024,
  mediaAllowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  guestSessionTtlHours: 24 * 30,
  joinGrantTtlSeconds: 15 * 60,
  roomDefaultLifetimeDays: 30,
} as const;

/**
 * Token-bucket style rate limits (per actor, per window).
 * `points` actions allowed per `windowSeconds`.
 */
export const RATE_LIMITS = {
  roomCreate: { points: 5, windowSeconds: 60 * 60 },
  chatMessage: { points: 8, windowSeconds: 10 },
  wish: { points: 3, windowSeconds: 60 },
  /** Per-IP; a visitor's guest-session row also keeps a per-room idempotency key. */
  publicWish: { points: 5, windowSeconds: 600 },
  exploreSummary: { points: 120, windowSeconds: 60 },
  gift: { points: 6, windowSeconds: 60 },
  invitationCreate: { points: 20, windowSeconds: 60 * 60 },
  emote: { points: 10, windowSeconds: 5 },
  analyticsIngest: { points: 60, windowSeconds: 60 },
  joinAttempt: { points: 10, windowSeconds: 60 },
  authAttempt: { points: 8, windowSeconds: 300 },
  accountCreate: { points: 30, windowSeconds: 3600 },
  worldEnter: { points: 30, windowSeconds: 60 },
  safetyAction: { points: 20, windowSeconds: 600 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;
