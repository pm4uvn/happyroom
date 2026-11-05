/**
 * World zone integration tests: in-process Colyseus + real PostgreSQL (zones synced via
 * `pnpm world:sync`) + real SDK WebSocket clients. No mocks.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "@colyseus/core";
import { signJoinGrant, signWorldGrant } from "@happyroom/shared/grant";
import { RUN_SPEED, SPEED_TOLERANCE, WORLD_PROTOCOL_VERSION } from "@happyroom/world";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "./db.js";
import { createGameServer } from "./server.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";
const KEY = randomBytes(32).toString("base64url");
const PORT = 30000 + Math.floor(Math.random() * 9000);
const endpoint = `ws://localhost:${PORT}`;
const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });
let gameServer: Server;
const opened: Room[] = [];

type Band = "under13" | "teen" | "adult";
async function profile(opts: { ageBand?: Band; chat?: boolean } = {}) {
  const name = `p${randomBytes(4).toString("hex")}`;
  const [p] =
    await sql`insert into player_profiles (auth_kind, display_name, avatar_preset, age_band, chat_enabled, profile_complete)
                        values ('guest', ${name}, 'sky', ${opts.ageBand ?? "adult"}, ${opts.chat ?? true}, true) returning id`;
  return { id: p!.id as string, name, ageBand: opts.ageBand ?? ("adult" as Band), chat: opts.chat ?? true };
}

function grant(p: Awaited<ReturnType<typeof profile>>, zoneId = "central_plaza", spawnId?: string) {
  return signWorldGrant(
    {
      profileId: p.id,
      displayName: p.name,
      avatar: "sky",
      ageBand: p.ageBand,
      chatEnabled: p.chat,
      zoneId,
      ...(spawnId ? { spawnId } : {}),
    },
    KEY,
    300,
  );
}

async function enter(
  p: Awaited<ReturnType<typeof profile>>,
  zoneId = "central_plaza",
  spawnId?: string,
  g = grant(p, zoneId, spawnId),
) {
  const room = await new Client(endpoint).joinOrCreate("zone", {
    zoneId,
    protocolVersion: WORLD_PROTOCOL_VERSION,
    grant: g,
  });
  opened.push(room);
  return room;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const players = (r: Room) => ((r.state as any)?.players ?? new Map()) as Map<string, any>;
async function waitFor<T>(fn: () => T | undefined | false, timeout = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}
function next<T = unknown>(room: Room, type: string, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no "${type}"`)), timeout);
    const off = room.onMessage(type, (m: T) => {
      clearTimeout(t);
      off();
      resolve(m);
    });
  });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  const [{ n }] =
    (await sql`select count(*)::int as n from world_zones where published_status = 'published'`) as unknown as [
      { n: number },
    ];
  if (n < 2) throw new Error("zones not synced; run `pnpm world:sync`");
  gameServer = createGameServer({
    GAME_SERVER_PORT: PORT,
    DATABASE_URL,
    JOIN_GRANT_SIGNING_KEY: KEY,
    GAME_ALLOWED_ORIGINS: "",
    NODE_ENV: "test",
  }).gameServer;
  await gameServer.listen(PORT);
});

afterAll(async () => {
  const settle = (p: Promise<unknown>) => Promise.race([p.catch(() => {}), sleep(500)]);
  await Promise.all(opened.map((r) => settle(r.leave(true))));
  await Promise.race([gameServer.gracefullyShutdown(false).catch(() => {}), sleep(3000)]);
  await closeDb();
  await sql.end();
});

describe("zone auth", () => {
  it("rejects forged grants, wrong-zone grants and party grants", async () => {
    const p = await profile();
    await expect(enter(p, "central_plaza", undefined, "forged.token-value-xx")).rejects.toThrow();
    await expect(enter(p, "central_plaza", undefined, grant(p, "garden_terrace"))).rejects.toThrow();
    const party = signJoinGrant(
      { roomId: randomUUID(), participantId: p.id, role: "host", displayName: p.name, avatar: "sky" },
      KEY,
      60,
    );
    await expect(enter(p, "central_plaza", undefined, party)).rejects.toThrow();
  });

  it("rejects banned profiles and unknown zones", async () => {
    const p = await profile();
    await sql`update player_profiles set banned_at = now() where id = ${p.id}`;
    await expect(enter(p)).rejects.toThrow();
    const q = await profile();
    await expect(enter(q, "no_such_zone")).rejects.toThrow();
  });
});

describe("presence and movement", () => {
  it("two players spawn safely, see each other and move simultaneously with facing + animation", async () => {
    const a = await profile();
    const b = await profile();
    const ra = await enter(a);
    const rb = await enter(b);
    await waitFor(() => players(ra).has(b.id) && players(rb).has(a.id));
    const sa = { x: players(ra).get(a.id).x, z: players(ra).get(a.id).z };
    const sb = { x: players(rb).get(b.id).x, z: players(rb).get(b.id).z };
    expect(Math.hypot(sa.x - sb.x, sa.z - sb.z)).toBeGreaterThan(0.6); // not stacked
    for (let i = 1; i <= 5; i++) {
      ra.send("move", { seq: i, x: sa.x + 0.3 * i, z: sa.z, rotY: 1.57, anim: "walk" });
      rb.send("move", { seq: i, x: sb.x - 0.3 * i, z: sb.z, rotY: -1.57, anim: "run" });
      await sleep(120);
    }
    await waitFor(() => players(rb).get(a.id).x > sa.x + 1.2 && players(ra).get(b.id).x < sb.x - 1.2);
    expect(players(rb).get(a.id).anim).toBe("walk");
    expect(players(ra).get(b.id).anim).toBe("run");
    expect(players(ra).get(b.id).rotY).toBeCloseTo(-1.57, 2);
  });

  it("caps sprint speed and blocks walking through the fountain", async () => {
    const p = await profile();
    const r = await enter(p);
    const me = await waitFor(() => players(r).get(p.id));
    const start = { x: me.x as number, z: me.z as number };
    const corr = next<{ x: number; z: number }>(r, "correct");
    r.send("move", { seq: 1, x: start.x, z: start.z - 12, rotY: 0, anim: "run" });
    const c = await corr;
    expect(start.z - c.z).toBeLessThanOrEqual(RUN_SPEED * SPEED_TOLERANCE * 0.5 + 0.01);
    // Walk step by step towards the fountain centre; the server keeps us outside its 2.6 m rim.
    let z = c.z;
    for (let i = 0; i < 40 && z > 0; i++) {
      z -= 0.6;
      r.send("move", { seq: 2 + i, x: 0, z, rotY: Math.PI, anim: "walk" });
      await sleep(130);
    }
    await sleep(200);
    const final = players(r).get(p.id);
    expect(Math.hypot(final.x, final.z)).toBeGreaterThanOrEqual(2.6 + 0.35 - 0.01);
  });

  it("broadcasts emotes", async () => {
    const a = await profile();
    const b = await profile();
    const ra = await enter(a);
    const rb = await enter(b);
    await waitFor(() => players(rb).has(a.id));
    ra.send("emote", { emote: "wave" });
    await waitFor(() => players(rb).get(a.id)?.emote === "wave");
  });

  it("keeps a dropped player's seat and restores it on reconnect", async () => {
    const a = await profile();
    const b = await profile();
    const ra = await enter(a);
    const rb = await enter(b);
    await waitFor(() => players(ra).get(b.id)?.connected);
    const token = rb.reconnectionToken;
    rb.reconnection.enabled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rb.connection as any).transport.ws.close(4999);
    await waitFor(() => players(ra).get(b.id)?.connected === false);
    opened.push(await new Client(endpoint).reconnect(token));
    await waitFor(() => players(ra).get(b.id)?.connected === true);
  });

  it("persists the last location and restores it on the next visit", async () => {
    const p = await profile();
    const r = await enter(p);
    const live = await waitFor(() => players(r).get(p.id));
    const me = { x: live.x as number, z: live.z as number }; // decoded state is live; copy it
    const target = { x: me.x - 1.5, z: me.z };
    for (let i = 1; i <= 5; i++) {
      r.send("move", { seq: i, x: me.x - 0.3 * i, z: me.z, rotY: 0, anim: "walk" });
      await sleep(120);
    }
    await sleep(200);
    await r.leave(true);
    await sleep(300);
    const [loc] = await sql`select x, z, last_portal_key from player_locations where profile_id = ${p.id}`;
    expect(loc!.x).toBeCloseTo(target.x, 0);
    const again = await enter(p);
    const back = await waitFor(() => players(again).get(p.id));
    // Restored near the saved spot; up to ~0.9 m away if another player is standing there.
    expect(Math.hypot(back.x - target.x, back.z - target.z)).toBeLessThan(1.0);
  });
});

describe("chat safety", () => {
  it("delivers chat, respects blocks, under-13 accounts and the filter, and rate-limits", async () => {
    const a = await profile();
    const b = await profile();
    const blocker = await profile();
    const kid = await profile({ ageBand: "under13" });
    await sql`insert into player_blocks (blocker_id, blocked_id) values (${blocker.id}, ${a.id})`;
    const [ra, rb, rBlocker, rKid] = [await enter(a), await enter(b), await enter(blocker), await enter(kid)];
    await waitFor(() => players(ra).size >= 4);
    const got = { b: [] as string[], blocker: [] as string[], kid: [] as string[] };
    rb.onMessage("chat", (m: { text: string }) => got.b.push(m.text));
    rBlocker.onMessage("chat", (m: { text: string }) => got.blocker.push(m.text));
    rKid.onMessage("chat", (m: { text: string }) => got.kid.push(m.text));
    ra.send("chat", { text: "  Hello plaza!  " });
    await waitFor(() => got.b.includes("Hello plaza!"));
    await sleep(200);
    expect(got.blocker).toEqual([]); // blocked sender is never delivered
    expect(got.kid).toEqual([]); // under-13: no public chat

    const kidErr = next<{ code: string }>(rKid, "error");
    rKid.send("chat", { text: "hi" });
    expect((await kidErr).code).toBe("chat_disabled");

    const filtered = next<{ code: string }>(ra, "error");
    ra.send("chat", { text: "you are a bitch" });
    expect((await filtered).code).toBe("chat_filtered");

    const errors: string[] = [];
    ra.onMessage("error", (e: { code: string }) => errors.push(e.code));
    for (let i = 0; i < 8; i++) ra.send("chat", { text: `msg ${i}` });
    await waitFor(() => errors.includes("rate_limited"));
  });
});

describe("portals", () => {
  it("refuses portals that are too far; grants nearby ones and returns the player to the door", async () => {
    const p = await profile();
    const r = await enter(p, "central_plaza", "spawn_center_south");
    await waitFor(() => players(r).get(p.id));
    const far = next<{ code: string }>(r, "error");
    r.send("usePortal", { portalId: "birthday_house_door" });
    expect((await far).code).toBe("too_far");
    await r.leave(true);

    const near = await enter(p, "central_plaza", "spawn_birthday_house");
    await waitFor(() => players(near).get(p.id));
    const granted = next<{ target: { kind: string } }>(near, "portal");
    near.send("usePortal", { portalId: "birthday_house_door" });
    expect((await granted).target.kind).toBe("birthday_house");
    await near.leave(true);
    await sleep(300);
    const [loc] = await sql`select x, z, last_portal_key from player_locations where profile_id = ${p.id}`;
    expect(loc).toMatchObject({ last_portal_key: "birthday_house_door" });
    expect(loc!.z).toBeCloseTo(-9.4, 1); // the return spawn in front of the house
  });

  it("the second zone loads from registry data and links back to the plaza", async () => {
    const p = await profile();
    const r = await enter(p, "garden_terrace", "from_plaza");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await waitFor(() => (r.state as any)?.zoneId === "garden_terrace" && players(r).get(p.id));
    const granted = next<{ target: { kind: string; zoneId: string; spawnId: string } }>(r, "portal");
    r.send("usePortal", { portalId: "plaza_gate" });
    expect((await granted).target).toEqual({
      kind: "zone",
      zoneId: "central_plaza",
      spawnId: "spawn_east_gate",
    });
  });
});

describe("instancing", () => {
  it("creates a second instance when a zone reaches maxPlayers (no single global scene)", async () => {
    const [{ max }] =
      (await sql`select max_players as max from world_zones where zone_key = 'garden_terrace'`) as unknown as [
        { max: number },
      ];
    const rooms: Room[] = [];
    for (let i = 0; i < max + 1; i++)
      rooms.push(await enter(await profile(), "garden_terrace", "from_plaza"));
    const ids = new Set(rooms.map((r) => r.roomId));
    expect(ids.size).toBeGreaterThanOrEqual(2);
    expect(
      Math.max(...[...ids].map((id) => rooms.filter((r) => r.roomId === id).length)),
    ).toBeLessThanOrEqual(max);
  });
});
