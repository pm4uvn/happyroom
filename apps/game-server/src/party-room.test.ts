/**
 * Integration tests: in-process Colyseus server + real PostgreSQL + real SDK WebSocket clients.
 * Requires `pnpm db:up && pnpm db:reset`. No mocks.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client, type Room } from "@colyseus/sdk";
import { BIRTHDAY_ROOM, PROTOCOL_VERSION } from "@happyroom/shared";
import { signJoinGrant } from "@happyroom/shared/grant";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "@colyseus/core";
import { closeDb } from "./db.js";
import { createGameServer } from "./server.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";
const KEY = randomBytes(32).toString("base64url");
const PORT = 40000 + Math.floor(Math.random() * 10000);
const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });

let gameServer: Server;
const endpoint = `ws://localhost:${PORT}`;

type Role = "host" | "cohost" | "guest";
interface Fixture {
  roomId: string;
  participants: Record<string, { id: string; role: Role; name: string }>;
}

async function makeRoom(opts: { capacity?: number; guests?: number } = {}): Promise<Fixture> {
  const hostSession = randomUUID();
  await sql`insert into guest_sessions (id, secret_hash, expires_at) values (${hostSession}, ${createHash("sha256").update(randomBytes(16)).digest()}, now() + interval '1 day')`;
  const [room] = await sql`
    insert into rooms (slug, title, honoree_name, theme_id, cake_style, decoration, time_zone, host_guest_session_id, capacity, expires_at)
    values (${"t" + randomBytes(5).toString("hex")}, 'Test party', 'Mai', 'cozy_twilight', 'berry_dream', 'balloons_pastel',
            'UTC', ${hostSession}, ${opts.capacity ?? 20}, now() + interval '7 days')
    returning id`;
  const participants: Fixture["participants"] = {};
  const add = async (key: string, role: Role, session: string) => {
    const [p] =
      await sql`insert into room_participants (room_id, guest_session_id, role, display_name, avatar_preset)
                          values (${room!.id}, ${session}, ${role}, ${key}, 'mint') returning id`;
    participants[key] = { id: p!.id, role, name: key };
  };
  await add("host", "host", hostSession);
  for (let i = 0; i < (opts.guests ?? 2); i++) {
    const s = randomUUID();
    await sql`insert into guest_sessions (id, secret_hash, expires_at) values (${s}, ${createHash("sha256").update(randomBytes(16)).digest()}, now() + interval '1 day')`;
    await add(`guest${i + 1}`, "guest", s);
  }
  return { roomId: room!.id, participants };
}

function grantFor(f: Fixture, key: string, overrides: Partial<{ roomId: string; role: Role }> = {}) {
  const p = f.participants[key]!;
  return signJoinGrant(
    {
      roomId: overrides.roomId ?? f.roomId,
      participantId: p.id,
      role: overrides.role ?? p.role,
      displayName: p.name,
      avatar: "mint",
    },
    KEY,
    300,
  );
}

const opened: Room[] = [];
async function join(f: Fixture, key: string, grant = grantFor(f, key)) {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate("party", {
    partyId: f.roomId,
    protocolVersion: PROTOCOL_VERSION,
    grant,
  });
  opened.push(room);
  return { client, room };
}

async function waitFor<T>(fn: () => T | undefined | false, timeout = 4000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}

function nextMessage<T = unknown>(room: Room, type: string, timeout = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no "${type}" message`)), timeout);
    const off = room.onMessage(type, (payload: T) => {
      clearTimeout(t);
      off();
      resolve(payload);
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const players = (room: Room) => ((room.state as any)?.players ?? new Map()) as Map<string, any>;

beforeAll(async () => {
  const { gameServer: gs } = createGameServer({
    GAME_SERVER_PORT: PORT,
    DATABASE_URL,
    JOIN_GRANT_SIGNING_KEY: KEY,
    GAME_ALLOWED_ORIGINS: "",
    NODE_ENV: "test",
  });
  gameServer = gs;
  await gameServer.listen(PORT);
});

afterAll(async () => {
  const settle = (p: Promise<unknown>) =>
    Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 500))]);
  await Promise.all(opened.map((r) => settle(r.leave(true))));
  await Promise.race([
    gameServer.gracefullyShutdown(false).catch(() => {}),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  await closeDb();
  await sql.end();
});

describe("authorization", () => {
  it("rejects a forged grant", async () => {
    const f = await makeRoom();
    await expect(join(f, "guest1", "forged.grant-token-value")).rejects.toThrow();
  });

  it("rejects a valid grant for a different room", async () => {
    const a = await makeRoom();
    const b = await makeRoom();
    await expect(join(b, "guest1", grantFor(a, "guest1"))).rejects.toThrow();
  });

  it("rejects banned participants", async () => {
    const f = await makeRoom();
    await sql`insert into room_bans (room_id, guest_session_id)
              select room_id, guest_session_id from room_participants where id = ${f.participants.guest1!.id}`;
    await expect(join(f, "guest1")).rejects.toThrow();
  });

  it("enforces room capacity", async () => {
    const f = await makeRoom({ capacity: 2, guests: 2 });
    await join(f, "host");
    await join(f, "guest1");
    await expect(join(f, "guest2")).rejects.toThrow();
  });

  it("rejects new guests when the room is locked, but lets the host in", async () => {
    const f = await makeRoom();
    const host = await join(f, "host");
    host.room.send("hostLock", { locked: true });
    await waitFor(() => (host.room.state as { locked: boolean }).locked);
    await expect(join(f, "guest1")).rejects.toThrow();
  });
});

describe("multiplayer sync", () => {
  it("two clients see each other and simultaneous movement", async () => {
    const f = await makeRoom();
    const a = await join(f, "host");
    const b = await join(f, "guest1");
    await waitFor(() => players(a.room).size === 2 && players(b.room).size === 2);

    const pa = f.participants.host!.id;
    const pb = f.participants.guest1!.id;
    // Decoded schema objects are live; copy the numbers.
    const startA = { ...(await waitFor(() => players(a.room).get(pa))) } as { x: number; z: number };
    const startB = { ...(await waitFor(() => players(b.room).get(pb))) } as { x: number; z: number };
    startA.x = players(a.room).get(pa).x;
    startA.z = players(a.room).get(pa).z;
    startB.x = players(b.room).get(pb).x;
    startB.z = players(b.room).get(pb).z;
    // Both move at the same time, in small valid steps.
    for (let i = 1; i <= 6; i++) {
      a.room.send("move", { seq: i, x: startA.x + 0.25 * i, z: startA.z, rotY: 1, moving: true });
      b.room.send("move", { seq: i, x: startB.x - 0.25 * i, z: startB.z, rotY: -1, moving: true });
      await new Promise((r) => setTimeout(r, 120));
    }
    await waitFor(
      () => players(b.room).get(pa).x > startA.x + 1.2 && players(a.room).get(pb).x < startB.x - 1.2,
    );
  });

  it("clamps teleports and sends a correction", async () => {
    const f = await makeRoom();
    const a = await join(f, "host");
    const live = await waitFor(() => players(a.room).get(f.participants.host!.id));
    const me = { x: live.x as number, z: live.z as number };
    const correction = nextMessage<{ x: number; reason: string }>(a.room, "correct");
    a.room.send("move", { seq: 1, x: me.x + 6, z: me.z, rotY: 0, moving: true });
    const c = await correction;
    expect(c.reason).toBe("speed");
    expect(c.x - me.x).toBeLessThan(BIRTHDAY_ROOM.maxSpeed * 1.35 * 0.5 + 0.01);
  });

  it("broadcasts emotes through state", async () => {
    const f = await makeRoom();
    const a = await join(f, "host");
    const b = await join(f, "guest1");
    await waitFor(() => players(b.room).size === 2);
    a.room.send("emote", { emote: "dance" });
    await waitFor(() => players(b.room).get(f.participants.host!.id)?.emote === "dance");
  });

  it("removes a player who leaves", async () => {
    const f = await makeRoom();
    const a = await join(f, "host");
    const b = await join(f, "guest1");
    await waitFor(() => players(a.room).size === 2);
    await b.room.leave(true);
    await waitFor(() => players(a.room).size === 1);
  });

  it("keeps a dropped player's seat and restores it on reconnect", async () => {
    const f = await makeRoom();
    const a = await join(f, "host");
    const b = await join(f, "guest1");
    const pb = f.participants.guest1!.id;
    await waitFor(() => players(a.room).get(pb)?.connected);
    const token = b.room.reconnectionToken;
    b.room.reconnection.enabled = false; // simulate a hard network loss, no SDK auto-retry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b.room.connection as any).transport.ws.close(4999);
    await waitFor(() => players(a.room).get(pb)?.connected === false);
    const again = await new Client(endpoint).reconnect(token);
    opened.push(again);
    await waitFor(() => players(a.room).get(pb)?.connected === true);
    expect(players(a.room).size).toBe(2);
  });
});

describe("ceremony", () => {
  it("only the host can start; all clients receive the same server timestamps", async () => {
    const f = await makeRoom();
    const host = await join(f, "host");
    const guest = await join(f, "guest1");
    const err = nextMessage<{ code: string }>(guest.room, "error");
    guest.room.send("ceremonyStart", {});
    expect((await err).code).toBe("forbidden");

    host.room.send("ceremonyStart", {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (r: Room) => (r.state as any).ceremony;
    await waitFor(() => c(guest.room)?.phase === "PREPARING" && c(host.room)?.phase === "PREPARING");
    expect(c(guest.room).phaseStartedAt).toBe(c(host.room).phaseStartedAt);
    expect(c(guest.room).run).toBe(1);

    const [row] = await sql`select run, final_phase from ceremonies where room_id = ${f.roomId}`;
    expect(row).toMatchObject({ run: 1 });
  });

  it("a late joiner receives the running ceremony state", async () => {
    const f = await makeRoom();
    const host = await join(f, "host");
    host.room.send("ceremonyStart", {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await waitFor(() => (host.room.state as any)?.ceremony?.phase === "PREPARING");
    const late = await join(f, "guest1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await waitFor(() => (late.room.state as any)?.ceremony?.phase === "PREPARING");
  });
});

describe("wishes, gifts and moderation", () => {
  it("persists a guest wish as pending; host approval publishes it to everyone", async () => {
    const f = await makeRoom();
    const host = await join(f, "host");
    const guest = await join(f, "guest1");
    const pending = nextMessage<{ id: string; body: string }>(host.room, "wishPending");
    guest.room.send("wish", { body: "  Happy birthday Mai! 🎂 " });
    const w = await pending;
    expect(w.body).toBe("Happy birthday Mai! 🎂");
    const [row] = await sql`select status, body from wishes where id = ${w.id}`;
    expect(row).toMatchObject({ status: "pending", body: "Happy birthday Mai! 🎂" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((guest.room.state as any).wishes.length).toBe(0);

    host.room.send("moderateWish", { wishId: w.id, approve: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await waitFor(() => (guest.room.state as any).wishes.length === 1);
    const [after] = await sql`select status from wishes where id = ${w.id}`;
    expect(after!.status).toBe("approved");
  });

  it("guests cannot moderate wishes, open gifts, lock the room or kick", async () => {
    const f = await makeRoom();
    await join(f, "host");
    const guest = await join(f, "guest1");
    for (const [type, payload] of [
      ["moderateWish", { wishId: randomUUID(), approve: true }],
      ["openGift", { giftId: randomUUID() }],
      ["hostLock", { locked: true }],
      ["hostKick", { participantId: f.participants.host!.id, ban: true }],
      ["hostGifts", { enabled: false }],
    ] as const) {
      const err = nextMessage<{ code: string }>(guest.room, "error");
      guest.room.send(type, payload);
      expect((await err).code, type).toBe("forbidden");
    }
    const [room] = await sql`select locked from rooms where id = ${f.roomId}`;
    expect(room!.locked).toBe(false);
  });

  it("sends gifts once per idempotency key and lets the host open them", async () => {
    const f = await makeRoom();
    const host = await join(f, "host");
    const guest = await join(f, "guest1");
    const key = randomUUID();
    guest.room.send("gift", { catalogId: "teddy_bear", message: "For you", idempotencyKey: key });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gifts = (r: Room) => (r.state as any).gifts;
    await waitFor(() => gifts(host.room).length === 1);
    const dup = nextMessage<{ code: string }>(guest.room, "error");
    guest.room.send("gift", { catalogId: "teddy_bear", message: "For you", idempotencyKey: key });
    expect((await dup).code).toBe("duplicate");
    const id = gifts(host.room)[0].id;
    host.room.send("openGift", { giftId: id });
    await waitFor(() => gifts(guest.room)[0]?.opened === true);
    const [row] = await sql`select status from room_gifts where id = ${id}`;
    expect(row!.status).toBe("opened");
  });

  it("host kick with ban removes the guest and blocks rejoining", async () => {
    const f = await makeRoom();
    const host = await join(f, "host");
    const guest = await join(f, "guest1");
    const left = new Promise<number>((r) => guest.room.onLeave((code) => r(code)));
    host.room.send("hostKick", { participantId: f.participants.guest1!.id, ban: true });
    expect(await left).toBe(4003);
    await waitFor(() => players(host.room).size === 1);
    await expect(join(f, "guest1")).rejects.toThrow();
  });

  it("rate-limits wish spam", async () => {
    const f = await makeRoom();
    await join(f, "host");
    const guest = await join(f, "guest1");
    const errors: string[] = [];
    guest.room.onMessage("error", (e: { code: string }) => errors.push(e.code));
    for (let i = 0; i < 6; i++) guest.room.send("wish", { body: `wish ${i}` });
    await waitFor(() => errors.includes("rate_limited"));
    await new Promise((r) => setTimeout(r, 300));
    const [{ n }] =
      (await sql`select count(*)::int as n from wishes where room_id = ${f.roomId}`) as unknown as [
        { n: number },
      ];
    expect(n).toBe(3);
  });
});
