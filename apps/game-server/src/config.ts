import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Load the monorepo root .env (if present) without overriding real environment variables. */
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const schema = z.object({
  GAME_SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(2567),
  DATABASE_URL: z.url(),
  JOIN_GRANT_SIGNING_KEY: z.string().min(32, "JOIN_GRANT_SIGNING_KEY must be at least 32 characters"),
  /** Comma-separated origins allowed to open WebSocket connections (empty = allow any, dev only). */
  GAME_ALLOWED_ORIGINS: z.string().default(""),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type GameConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GameConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid game-server environment — ${keys}`);
  }
  return parsed.data;
}
