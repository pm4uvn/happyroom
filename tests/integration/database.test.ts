/**
 * Database integration tests. Requires a migrated + seeded database:
 *   pnpm db:up && pnpm db:reset && pnpm --filter @happyroom/integration-tests test:integration
 * Each test runs inside a transaction that is rolled back, so the database is left unchanged.
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";
const sql = postgres(url, { max: 2, onnotice: () => {} });

class Rollback extends Error {}

/** Run `fn` in a transaction and always roll back. */
async function inTx(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });
}

/** Expect a statement to fail with a given SQLSTATE, using a savepoint so the tx stays usable. */
async function expectSqlError(
  tx: postgres.TransactionSql,
  code: string,
  fn: (sp: postgres.TransactionSql) => Promise<unknown>,
) {
  let caught: { code?: string } | undefined;
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
  } catch (e) {
    caught = e as { code?: string };
  }
  expect(caught?.code, `expected SQLSTATE ${code}`).toBe(code);
}

const hash = () => createHash("sha256").update(randomBytes(32)).digest();

async function makeGuest(tx: postgres.TransactionSql, expiresInDays = 30) {
  const [g] = await tx`
    insert into guest_sessions (secret_hash, expires_at)
    values (${hash()}, now() + make_interval(days => ${expiresInDays}))
    returning id`;
  return g!.id as string;
}

async function makeRoom(tx: postgres.TransactionSql, guestId: string, extra: Record<string, unknown> = {}) {
  const row = {
    slug: `test-${randomBytes(4).toString("hex")}`,
    title: "Mai's birthday",
    honoree_name: "Mai",
    theme_id: "cozy_twilight",
    cake_style: "berry_dream",
    decoration: "balloons_pastel",
    time_zone: "Asia/Ho_Chi_Minh",
    host_guest_session_id: guestId,
    expires_at: new Date(Date.now() + 30 * 86_400_000),
    ...extra,
  };
  const [r] = await tx`insert into rooms ${tx(row)} returning id, slug`;
  return r as { id: string; slug: string };
}

beforeAll(async () => {
  const n: number = (await sql`select count(*)::int as n from happyroom_internal.schema_migrations`)[0]!.n;
  if (n < 3) throw new Error("database not migrated; run `pnpm db:reset` first");
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("schema", () => {
  it("creates every table required by the data model", async () => {
    const required = [
      "users",
      "guest_sessions",
      "rooms",
      "room_themes",
      "room_objects",
      "room_participants",
      "invitations",
      "wishes",
      "gifts_catalog",
      "room_gifts",
      "ceremonies",
      "ceremony_events",
      "media_assets",
      "memory_albums",
      "products",
      "orders",
      "order_items",
      "entitlements",
      "moderation_reports",
      "room_bans",
      "analytics_events",
    ];
    const rows = await sql`select tablename from pg_tables where schemaname = 'public'`;
    const names = new Set(rows.map((r) => r.tablename));
    for (const t of required) expect(names, t).toContain(t);
  });

  it("enables row level security on every public table", async () => {
    const rows = await sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("seeds the two MVP themes and six free gifts", async () => {
    const themes = await sql`select id from room_themes where active order by sort_order`;
    expect(themes.map((t) => t.id)).toEqual(["cozy_twilight", "sunny_garden"]);
    const gifts = await sql`select id from gifts_catalog where active and is_free`;
    expect(gifts).toHaveLength(6);
  });
});

describe("row level security (browser roles)", () => {
  it("anon can read active catalogs but nothing room-related", async () => {
    await inTx(async (tx) => {
      await tx`set local role anon`;
      const themes = await tx`select id from room_themes`;
      expect(themes.length).toBe(2);
      for (const table of [
        "rooms",
        "room_participants",
        "invitations",
        "wishes",
        "guest_sessions",
        "analytics_events",
        "media_assets",
      ]) {
        await expectSqlError(tx, "42501", (sp) => sp.unsafe(`select 1 from public.${table} limit 1`));
      }
      await expectSqlError(
        tx,
        "42501",
        (sp) =>
          sp`insert into room_themes (id, event_type, name_key, description_key) values ('hack_theme', 'birthday', 'x', 'y')`,
      );
    });
  });

  it("anon cannot read the share-preview or analytics views", async () => {
    await inTx(async (tx) => {
      await tx`set local role anon`;
      await expectSqlError(tx, "42501", (sp) => sp`select * from room_share_previews`);
      await expectSqlError(tx, "42501", (sp) => sp`select * from analytics_room_creation_funnel_daily`);
    });
  });

  it("authenticated users only see their own user row and orders", async () => {
    await inTx(async (tx) => {
      const [a] = await tx`insert into auth.users (email) values ('a@example.test') returning id`;
      const [b] = await tx`insert into auth.users (email) values ('b@example.test') returning id`;
      await tx`insert into users (id, display_name) values (${a!.id}, 'A'), (${b!.id}, 'B')`;
      await tx`insert into orders (user_id, currency, subtotal_minor, total_minor) values (${b!.id}, 'USD', 100, 100)`;

      await tx`select set_config('request.jwt.claim.sub', ${a!.id}, true)`;
      await tx`set local role authenticated`;
      const users = await tx`select id from users`;
      expect(users.map((u) => u.id)).toEqual([a!.id]);
      expect(await tx`select id from orders`).toHaveLength(0);
      // Cannot change another user's row (silently filtered by RLS).
      const updated = await tx`update users set display_name = 'pwned' where id = ${b!.id} returning id`;
      expect(updated).toHaveLength(0);
      // Cannot touch privileged columns at all.
      await expectSqlError(
        tx,
        "42501",
        (sp) => sp`update users set deletion_requested_at = now() where id = ${a!.id}`,
      );
    });
  });
});

describe("constraints", () => {
  it("requires an access-code hash exactly when privacy is access_code", async () => {
    await inTx(async (tx) => {
      const g = await makeGuest(tx);
      await expectSqlError(tx, "23514", (sp) => makeRoom(sp, g, { privacy: "access_code" }));
      await expectSqlError(tx, "23514", (sp) => makeRoom(sp, g, { access_code_hash: "scrypt$x" }));
      await makeRoom(tx, g, { privacy: "access_code", access_code_hash: "scrypt$16384$8$1$salt$hash" });
    });
  });

  it("requires an owner for active rooms", async () => {
    await inTx(async (tx) => {
      await expectSqlError(tx, "23514", (sp) => makeRoom(sp, null as unknown as string));
    });
  });

  it("allows exactly one host per room", async () => {
    await inTx(async (tx) => {
      const g1 = await makeGuest(tx);
      const g2 = await makeGuest(tx);
      const room = await makeRoom(tx, g1);
      await tx`insert into room_participants (room_id, guest_session_id, role, display_name, avatar_preset)
               values (${room.id}, ${g1}, 'host', 'Host', 'sunny')`;
      await expectSqlError(
        tx,
        "23505",
        (
          sp,
        ) => sp`insert into room_participants (room_id, guest_session_id, role, display_name, avatar_preset)
               values (${room.id}, ${g2}, 'host', 'Other', 'berry')`,
      );
    });
  });

  it("rejects duplicate gift submissions with the same idempotency key", async () => {
    await inTx(async (tx) => {
      const g = await makeGuest(tx);
      const room = await makeRoom(tx, g);
      const [p] =
        await tx`insert into room_participants (room_id, guest_session_id, display_name, avatar_preset)
                           values (${room.id}, ${g}, 'Guest', 'mint') returning id`;
      const key = "6f1c1a52-6b2b-4d8e-9a43-2a1f6d2d9e10";
      const gift = {
        room_id: room.id,
        catalog_id: "star",
        sender_participant_id: p!.id,
        sender_display_name: "Guest",
        idempotency_key: key,
      };
      await tx`insert into room_gifts ${tx(gift)}`;
      await expectSqlError(tx, "23505", (sp) => sp`insert into room_gifts ${sp(gift)}`);
    });
  });

  it("enforces integer minor-unit totals on order items", async () => {
    await inTx(async (tx) => {
      const [prod] = await tx`insert into products (sku, kind, name_key, price_minor, currency)
                              values ('test.gift', 'virtual_gift', 'k', 199, 'USD') returning id`;
      const [order] =
        await tx`insert into orders (currency, subtotal_minor, total_minor) values ('USD', 398, 398) returning id`;
      await expectSqlError(
        tx,
        "23514",
        (sp) => sp`insert into order_items (order_id, product_id, quantity, unit_price_minor, total_minor)
               values (${order!.id}, ${prod!.id}, 2, 199, 400)`,
      );
      await tx`insert into order_items (order_id, product_id, quantity, unit_price_minor, total_minor)
               values (${order!.id}, ${prod!.id}, 2, 199, 398)`;
      await expectSqlError(
        tx,
        "23514",
        (sp) => sp`insert into products (sku, kind, name_key, price_minor, currency)
               values ('bad.price', 'virtual_gift', 'k', -1, 'USD')`,
      );
    });
  });

  it("requires explicit consent and an allowed type/size for media", async () => {
    await inTx(async (tx) => {
      const g = await makeGuest(tx);
      const room = await makeRoom(tx, g);
      const base = {
        room_id: room.id,
        kind: "memory_photo",
        storage_bucket: "media",
        mime_type: "image/png",
        byte_size: 1000,
      };
      await expectSqlError(
        tx,
        "23502",
        (sp) => sp`insert into media_assets ${sp({ ...base, storage_key: "a" })}`,
      );
      await expectSqlError(
        tx,
        "23514",
        (sp) =>
          sp`insert into media_assets ${sp({ ...base, storage_key: "b", mime_type: "image/svg+xml", consent_confirmed_at: new Date() })}`,
      );
      await expectSqlError(
        tx,
        "23514",
        (sp) =>
          sp`insert into media_assets ${sp({ ...base, storage_key: "c", byte_size: 9_000_000, consent_confirmed_at: new Date() })}`,
      );
    });
  });

  it("only accepts known analytics event names and object properties", async () => {
    await inTx(async (tx) => {
      await expectSqlError(
        tx,
        "23514",
        (sp) => sp`insert into analytics_events (event_name, occurred_at) values ('user_email', now())`,
      );
      await expectSqlError(
        tx,
        "23514",
        (sp) =>
          sp`insert into analytics_events (event_name, occurred_at, properties) values ('landing_view', now(), '[]'::jsonb)`,
      );
      await tx`insert into analytics_events (event_name, occurred_at) values ('landing_view', now())`;
    });
  });
});

describe("public/private separation", () => {
  it("share previews hide the honoree unless the host opted in", async () => {
    await inTx(async (tx) => {
      const g = await makeGuest(tx);
      const hidden = await makeRoom(tx, g);
      const shown = await makeRoom(tx, g, { share_preview_show_honoree: true });
      const off = await makeRoom(tx, g, { share_preview_enabled: false });
      const rows =
        await tx`select slug, honoree_name from room_share_previews where slug in ${tx([hidden.slug, shown.slug, off.slug])}`;
      const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.honoree_name]));
      expect(bySlug[hidden.slug]).toBeNull();
      expect(bySlug[shown.slug]).toBe("Mai");
      expect(off.slug in bySlug).toBe(false);
      const cols =
        await tx`select column_name from information_schema.columns where table_name = 'room_share_previews'`;
      const names = cols.map((c) => c.column_name);
      expect(names).not.toContain("access_code_hash");
      expect(names).not.toContain("host_guest_session_id");
    });
  });
});

describe("retention", () => {
  it("archives, then deletes expired rooms, queues their media and removes expired guests", async () => {
    await inTx(async (tx) => {
      const g = await makeGuest(tx, 1);
      const room = await makeRoom(tx, g, {
        created_at: new Date(Date.now() - 90 * 86_400_000),
        expires_at: new Date(Date.now() - 60 * 86_400_000),
      });
      await tx`insert into media_assets (room_id, kind, storage_bucket, storage_key, mime_type, byte_size, consent_confirmed_at)
               values (${room.id}, 'memory_photo', 'media', ${`rooms/${room.id}/a.webp`}, 'image/webp', 500, now())`;

      // Pass 1 ("now"): archive the room. Guest still hosts a non-archived room before this pass.
      const first = await tx`select happyroom_run_retention(now()) as r`;
      expect(first[0]!.r.rooms_archived).toBeGreaterThanOrEqual(1);
      expect(first[0]!.r.media_queued_for_purge).toBeGreaterThanOrEqual(1);
      expect(first[0]!.r.rooms_deleted).toBeGreaterThanOrEqual(1);

      const remaining = await tx`select id from rooms where id = ${room.id}`;
      expect(remaining).toHaveLength(0);
      const queued =
        await tx`select reason from storage_purge_queue where storage_key = ${`rooms/${room.id}/a.webp`}`;
      expect(queued[0]?.reason).toBe("room_expired");

      // Guest session expires later; a retention pass in the future removes it.
      const later = await tx`select happyroom_run_retention(now() + interval '2 days') as r`;
      expect(later[0]!.r.guest_sessions_deleted).toBeGreaterThanOrEqual(1);
      expect(await tx`select id from guest_sessions where id = ${g}`).toHaveLength(0);
    });
  });

  it("keeps guest sessions that still host an active room", async () => {
    await inTx(async (tx) => {
      const g = await makeGuest(tx, 1);
      await makeRoom(tx, g, { expires_at: new Date(Date.now() + 60 * 86_400_000) });
      await tx`select happyroom_run_retention(now() + interval '2 days')`;
      expect(await tx`select id from guest_sessions where id = ${g}`).toHaveLength(1);
    });
  });
});

describe("world schema", () => {
  it("has RLS on every world table and blocks browser roles", async () => {
    const tables = [
      "worlds",
      "world_versions",
      "world_zones",
      "zone_assets",
      "zone_spawn_points",
      "zone_portals",
      "player_profiles",
      "player_sessions",
      "player_locations",
      "player_progress",
      "world_events",
      "player_blocks",
      "player_reports",
    ];
    const rows = await sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and relname = any(${tables}) and c.relrowsecurity`;
    expect(rows.map((r) => r.relname).sort()).toEqual([...tables].sort());
    await inTx(async (tx) => {
      await tx`set local role anon`;
      for (const t of ["player_profiles", "player_sessions", "world_zones"]) {
        await expectSqlError(tx, "42501", (sp) => sp.unsafe(`select 1 from public.${t} limit 1`));
      }
    });
  });

  it("enforces case-insensitive unique display names and credential consistency", async () => {
    await inTx(async (tx) => {
      await tx`insert into player_profiles (auth_kind, display_name, avatar_preset) values ('guest', 'Sunny Day', 'sunny')`;
      await expectSqlError(
        tx,
        "23505",
        (sp) =>
          sp`insert into player_profiles (auth_kind, display_name, avatar_preset) values ('guest', 'sunny day', 'mint')`,
      );
      // A password account must have a username and a hash; guests must not.
      await expectSqlError(
        tx,
        "23514",
        (sp) =>
          sp`insert into player_profiles (auth_kind, display_name, avatar_preset) values ('password', 'NoHash', 'mint')`,
      );
      await expectSqlError(
        tx,
        "23514",
        (sp) =>
          sp`insert into player_profiles (auth_kind, display_name, avatar_preset, username, password_hash) values ('guest', 'Weird', 'mint', 'weird', 'x')`,
      );
    });
  });

  it("publishes the synced zones with exactly one default spawn each", async () => {
    const zones = await sql`select z.zone_key, count(*) filter (where s.is_default)::int as defaults
                              from world_zones z join zone_spawn_points s on s.zone_id = z.id
                             where z.published_status = 'published' group by z.zone_key order by z.zone_key`;
    expect(zones.map((z) => z.zone_key)).toEqual(expect.arrayContaining(["central_plaza", "garden_terrace"]));
    for (const z of zones) expect(z.defaults).toBe(1);
  });
});
