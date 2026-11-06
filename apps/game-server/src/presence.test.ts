/**
 * Integration test for the internal presence snapshot used by the web app's Explore summary
 * (real HTTP server, real Colyseus matchmaker). Requires `pnpm db:up && pnpm db:reset`.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "@colyseus/sdk";
import { PROTOCOL_VERSION } from "@happyroom/shared";
import { signJoinGrant } from "@happyroom/shared/grant";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "./db.js";
import { startGameServer } from "./server.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";
const KEY = randomBytes(32).toString("base64url");
const PORT = 40000 + Math.floor(Math.random() * 10000);
const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });
const base = `http://localhost:${PORT}`;

let server: Awaited<ReturnType<typeof startGameServer>>;

beforeAll(async () => {
  server = await startGameServer(
    {
      GAME_SERVER_PORT: PORT,
      DATABASE_URL,
      JOIN_GRANT_SIGNING_KEY: KEY,
      GAME_ALLOWED_ORIGINS: "",
      NODE_ENV: "test",
    },
    PORT,
  );
});

afterAll(async () => {
  await Promise.race([
    server.gameServer.gracefullyShutdown(false).catch(() => {}),
    new Promise((r) => setTimeout(r, 3000)),
  ]);
  await closeDb();
  await sql.end();
});

async function makeRoom() {
  const hostSession = randomUUID();
  await sql`insert into guest_sessions (id, secret_hash, expires_at) values (${hostSession}, ${createHash("sha256").update(randomBytes(16)).digest()}, now() + interval '1 day')`;
  const [room] = await sql`
    insert into rooms (slug, title, honoree_name, theme_id, cake_style, decoration, time_zone, host_guest_session_id, capacity, expires_at)
    values (${"t" + randomBytes(5).toString("hex")}, 'Test party', 'Mai', 'cozy_twilight', 'berry_dream', 'balloons_pastel',
            'UTC', ${hostSession}, 20, now() + interval '7 days')
    returning id`;
  const [p] =
    await sql`insert into room_participants (room_id, guest_session_id, role, display_name, avatar_preset)
                        values (${room!.id}, ${hostSession}, 'host', 'Host', 'mint') returning id`;
  return { roomId: room!.id as string, participantId: p!.id as string };
}

describe("GET /internal/presence", () => {
  it("rejects requests without the shared internal key", async () => {
    const res = await fetch(`${base}/internal/presence`);
    expect(res.status).toBe(401);
    const res2 = await fetch(`${base}/internal/presence`, { headers: { "x-internal-key": "wrong" } });
    expect(res2.status).toBe(401);
  });

  it("reports a connected party room's client count and nothing else", async () => {
    const f = await makeRoom();
    const grant = signJoinGrant(
      { roomId: f.roomId, participantId: f.participantId, role: "host", displayName: "Host", avatar: "mint" },
      KEY,
      300,
    );
    const client = new Client(`ws://localhost:${PORT}`);
    const room = await client.joinOrCreate("party", {
      partyId: f.roomId,
      protocolVersion: PROTOCOL_VERSION,
      grant,
    });
    try {
      const res = await fetch(`${base}/internal/presence`, { headers: { "x-internal-key": KEY } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { partyRooms: { roomId: string; clients: number }[] };
      const mine = body.partyRooms.find((r) => r.roomId === f.roomId);
      expect(mine).toMatchObject({ clients: 1 });
      // Never leaks anything beyond an id and a count.
      expect(Object.keys(mine!).sort()).toEqual(["clients", "roomId"]);
    } finally {
      await room.leave(true).catch(() => {});
    }
  });
});
