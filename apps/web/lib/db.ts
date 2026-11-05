import "server-only";
import postgres from "postgres";
import { serverEnv } from "./env";

/**
 * Trusted server-side database access. Uses a privileged connection, so every caller
 * MUST perform its own authorization checks first (see docs/SECURITY.md).
 * Returns null when DATABASE_URL is not configured.
 */
type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __happyroomSql?: Sql };

export function getDb(): Sql | null {
  const url = serverEnv().DATABASE_URL;
  if (!url) return null;
  if (!globalForDb.__happyroomSql) {
    globalForDb.__happyroomSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idle_timeout: 20,
      connect_timeout: 10, // remote (e.g. Supabase) first connections include TLS + pooler handshakes
      // Required for Supabase's transaction-mode pooler (port 6543).
      prepare: !url.includes(":6543"),
      onnotice: () => {},
    });
  }
  return globalForDb.__happyroomSql;
}

export async function checkDatabase(): Promise<"ok" | "not_configured" | "unavailable"> {
  const db = getDb();
  if (!db) return "not_configured";
  try {
    await Promise.race([
      db`select 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    return "ok";
  } catch {
    return "unavailable";
  }
}
