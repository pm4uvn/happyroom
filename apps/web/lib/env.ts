import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at first use. Optional services are genuinely optional:
 * when a variable is missing, the feature that needs it reports "not_configured" instead of
 * pretending to work.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url().optional(),
  APP_VERSION: z.string().max(64).optional(),
  /** Shared with the game server; signs join grants. */
  JOIN_GRANT_SIGNING_KEY: z.string().min(32).optional(),
  /** WebSocket URL browsers use to reach the game server (runtime, not baked into the build). */
  GAME_SERVER_PUBLIC_URL: z
    .string()
    .regex(/^wss?:\/\//)
    .default("ws://localhost:2567"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL || undefined,
    APP_VERSION: process.env.APP_VERSION || process.env.npm_package_version || undefined,
    JOIN_GRANT_SIGNING_KEY: process.env.JOIN_GRANT_SIGNING_KEY || undefined,
    GAME_SERVER_PUBLIC_URL: process.env.GAME_SERVER_PUBLIC_URL || undefined,
  });
  if (!parsed.success) {
    // Report which variables are invalid, never their values.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${keys}`);
  }
  cached = parsed.data;
  return cached;
}
