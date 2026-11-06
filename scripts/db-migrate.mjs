#!/usr/bin/env node
/**
 * Minimal, dependency-light migration runner for local development and CI.
 *
 *   node scripts/db-migrate.mjs            apply pending migrations
 *   node scripts/db-migrate.mjs --seed     ... and apply seeds (idempotent)
 *   node scripts/db-migrate.mjs --reset    DROP and recreate the local schema first (localhost only)
 *
 * Against a hosted Supabase project, prefer `supabase db push` — the SQL files are identical.
 * Applied migrations are tracked in happyroom_internal.schema_migrations with a checksum, and an
 * edited, already-applied migration is reported as an error rather than silently skipped.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Same root .env the web app and game server already load (next.config.ts, game-server config.ts).
// loadEnvFile never overrides a variable the shell already exported, so `DATABASE_URL=... node
// scripts/db-migrate.mjs` still wins when you want to target something other than .env.
const rootEnv = path.join(root, ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const args = new Set(process.argv.slice(2));
const url = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";

const parsed = new URL(url);
const isLocal = ["localhost", "127.0.0.1", "::1", "postgres"].includes(parsed.hostname);
const redacted = `${parsed.protocol}//${parsed.username ? `${parsed.username}:***@` : ""}${parsed.host}${parsed.pathname}`;

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function sqlFiles(dir) {
  const entries = await readdir(dir).catch(() => []);
  return entries.filter((f) => f.endsWith(".sql")).sort();
}

async function main() {
  console.log(`[db] target ${redacted}`);

  if (args.has("--reset")) {
    if (!isLocal) throw new Error("--reset is only allowed against a local database");
    console.log("[db] resetting public + happyroom_internal schemas");
    await sql.unsafe(`
      drop schema if exists public cascade;
      drop schema if exists happyroom_internal cascade;
      create schema public;
      grant usage on schema public to public;
    `);
  }

  const [{ exists: hasAuth }] =
    await sql`select exists (select 1 from pg_namespace where nspname = 'auth') as exists`;
  if (!hasAuth) {
    if (!isLocal) throw new Error("auth schema missing on a non-local database; is this a Supabase project?");
    console.log("[db] applying local auth shim (plain PostgreSQL detected)");
    await sql.unsafe(await readFile(path.join(root, "infra/db/local-auth-shim.sql"), "utf8"));
  }

  await sql.unsafe(`
    create schema if not exists happyroom_internal;
    revoke all on schema happyroom_internal from public;
    create table if not exists happyroom_internal.schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Map(
    (await sql`select name, checksum from happyroom_internal.schema_migrations`).map((r) => [
      r.name,
      r.checksum,
    ]),
  );

  const migrationsDir = path.join(root, "supabase/migrations");
  let count = 0;
  for (const file of await sqlFiles(migrationsDir)) {
    const body = await readFile(path.join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`migration ${file} was modified after being applied; create a new migration instead`);
      }
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into happyroom_internal.schema_migrations (name, checksum) values (${file}, ${checksum})`;
    });
    console.log(`[db] applied ${file}`);
    count++;
  }
  console.log(`[db] ${count} migration(s) applied, ${applied.size} already up to date`);

  if (args.has("--seed")) {
    const seedsDir = path.join(root, "supabase/seeds");
    for (const file of await sqlFiles(seedsDir)) {
      await sql.unsafe(await readFile(path.join(seedsDir, file), "utf8"));
      console.log(`[db] seeded ${file}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(`[db] FAILED: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
