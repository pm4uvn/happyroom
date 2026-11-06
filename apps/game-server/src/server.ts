import http from "node:http";
import { matchMaker, Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { GameConfig } from "./config.js";
import { connectDb, db } from "./db.js";
import { log } from "./logger.js";
import { configurePartyRoom, PartyRoom } from "./party-room.js";
import { configureZoneRoom, ZoneRoom } from "./zone-room.js";

const startedAt = Date.now();

/** Build (but do not start) the game server. Used by index.ts and integration tests. */
export function createGameServer(config: GameConfig) {
  connectDb(config.DATABASE_URL);
  configurePartyRoom({ grantKey: config.JOIN_GRANT_SIGNING_KEY });
  configureZoneRoom({ grantKey: config.JOIN_GRANT_SIGNING_KEY });

  const allowed = config.GAME_ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const httpServer = http.createServer();

  const transport = new WebSocketTransport({
    server: httpServer,
    pingInterval: 5000,
    verifyClient: allowed.length
      ? (info: { origin: string }, done: (ok: boolean) => void) => done(allowed.includes(info.origin))
      : undefined,
  } as never);

  const gameServer = new Server({ transport, gracefullyShutdown: false });
  gameServer.define("party", PartyRoom).filterBy(["partyId"]);
  // Public world zones: one room type, many instances (shards) per zone; matchmaking by zoneId.
  gameServer.define("zone", ZoneRoom).filterBy(["zoneId"]);
  return { gameServer, httpServer };
}

async function healthHandler(_req: http.IncomingMessage, res: http.ServerResponse) {
  let database: "ok" | "unavailable" = "ok";
  try {
    await db()`select 1`;
  } catch {
    database = "unavailable";
  }
  let rooms = 0;
  let clients = 0;
  try {
    const list = await matchMaker.query({});
    rooms = list.length;
    clients = list.reduce((n, r) => n + (r.clients ?? 0), 0);
  } catch {
    /* matchmaker not ready */
  }
  const cpu = process.cpuUsage();
  const mem = process.memoryUsage();
  res.writeHead(database === "ok" ? 200 : 503, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(
    JSON.stringify({
      status: database === "ok" ? "ok" : "degraded",
      service: "game-server",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      rooms,
      clients,
      // Process metrics for monitoring and load tests (cumulative CPU time in ms).
      process: {
        rssMB: Math.round(mem.rss / 1048576),
        heapMB: Math.round(mem.heapUsed / 1048576),
        cpuUserMs: Math.round(cpu.user / 1000),
        cpuSystemMs: Math.round(cpu.system / 1000),
      },
      checks: { database },
    }),
  );
}

/**
 * Internal, trusted-callers-only snapshot of live party rooms: `{ roomId, clients }[]`.
 * `roomId` is `rooms.id` (party rooms set `this.roomId = row.id`, see party-room.ts), so the web
 * app can join this with its own `rooms` query by primary key. Never exposes zone rooms (world),
 * participant identities or anything beyond a room id and a client count.
 *
 * Protected by a shared-secret header (the same JOIN_GRANT_SIGNING_KEY both servers already
 * hold) rather than left open, since it reveals which private rooms currently have people in
 * them. It is not meant to be reachable from the public internet; in production put it behind
 * the same network boundary as the game server itself.
 */
async function presenceHandler(req: http.IncomingMessage, res: http.ServerResponse, internalKey: string) {
  const headerKey = req.headers["x-internal-key"];
  if (!internalKey || headerKey !== internalKey) {
    res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  let partyRooms: { roomId: string; clients: number }[] = [];
  try {
    const list = await matchMaker.query({ name: "party" });
    partyRooms = list.map((r) => ({ roomId: r.roomId, clients: r.clients ?? 0 }));
  } catch {
    /* matchmaker not ready: report an empty, honest snapshot rather than guessing */
  }
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify({ partyRooms }));
}

/**
 * Colyseus attaches its own HTTP request listeners (matchmaking routes, 404 for anything else).
 * Wrap them in one dispatcher so our own routes are served first and everything else by Colyseus.
 */
function installHealthRoute(httpServer: http.Server, internalKey: string) {
  const original = httpServer.listeners("request") as ((
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => void)[];
  httpServer.removeAllListeners("request");
  httpServer.on("request", (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.method === "GET" && (req.url === "/health" || req.url?.startsWith("/health?"))) {
      void healthHandler(req, res);
      return;
    }
    if (req.method === "GET" && req.url === "/internal/presence") {
      void presenceHandler(req, res, internalKey);
      return;
    }
    for (const l of original) l.call(httpServer, req, res);
  });
}

export { installHealthRoute };

export async function startGameServer(config: GameConfig, port = config.GAME_SERVER_PORT) {
  const { gameServer, httpServer } = createGameServer(config);
  await gameServer.listen(port);
  installHealthRoute(httpServer, config.JOIN_GRANT_SIGNING_KEY);
  log.info("game server listening", { port });
  return { gameServer, httpServer };
}
