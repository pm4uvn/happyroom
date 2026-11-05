#!/usr/bin/env node
/**
 * Zone load test: N real WebSocket clients join a world zone through normal matchmaking, each
 * walking continuously (12.5 move messages/s, like the browser client) and pinging every second.
 *
 *   node tests/load/zone-load.mjs --clients 30 --seconds 30 [--zone central_plaza] [--url ws://localhost:2599]
 *
 * Starts its own game server (unless --url is given) with a throwaway signing key, creates test
 * profiles directly in the database, and prints + saves measured results (tests/load/results/).
 * Measures: join latency, ping RTT under load, state patches received per client per second,
 * instance count (sharding), and server CPU / memory from /health.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const req = createRequire(path.join(root, "apps/game-server/package.json"));
const { Client } = req("@colyseus/sdk");
const postgres = req("postgres");
const { signWorldGrant } = await import(new URL("../../packages/shared/dist/grant.js", import.meta.url).href);

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const N = Number(arg("clients", 20));
const SECONDS = Number(arg("seconds", 30));
const ZONE = arg("zone", "central_plaza");
const PORT = 2599;
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://happyroom:happyroom@localhost:54329/happyroom";
const KEY = randomBytes(32).toString("base64url");
let url = arg("url", null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) =>
  arr.length
    ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))]
    : null;
const round = (n) => (n === null ? null : Math.round(n * 10) / 10);

let server = null;
if (!url) {
  server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: path.join(root, "apps/game-server"),
    env: {
      ...process.env,
      GAME_SERVER_PORT: String(PORT),
      JOIN_GRANT_SIGNING_KEY: KEY,
      DATABASE_URL,
      NODE_ENV: "production",
    },
    stdio: "ignore",
  });
  url = `ws://localhost:${PORT}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/health`)).ok) break;
    } catch {}
    await sleep(500);
  }
}
const httpBase = url.replace(/^ws/, "http");
const health = async () => (await fetch(`${httpBase}/health`)).json();

const sql = postgres(DATABASE_URL, { max: 2, onnotice: () => {} });
const profiles = [];
for (let i = 0; i < N; i++) {
  const [p] =
    await sql`insert into player_profiles (auth_kind, display_name, avatar_preset, age_band, profile_complete)
                        values ('guest', ${`load${randomBytes(4).toString("hex")}`}, 'sky', 'adult', true) returning id, display_name`;
  profiles.push(p);
}

const clients = [];
const joinMs = [];
const rtt = [];
const before = await health();
const t0 = Date.now();

for (const p of profiles) {
  const grant = signWorldGrant(
    {
      profileId: p.id,
      displayName: p.display_name,
      avatar: "sky",
      ageBand: "adult",
      chatEnabled: true,
      zoneId: ZONE,
    },
    KEY,
    600,
  );
  const start = performance.now();
  const room = await new Client(url).joinOrCreate("zone", { zoneId: ZONE, protocolVersion: 1, grant });
  joinMs.push(performance.now() - start);
  const c = { room, patches: 0, x: 0, z: 12, a: Math.random() * Math.PI * 2, seq: 0 };
  room.onStateChange(() => (c.patches += 1));
  room.onMessage("pong", (m) => rtt.push(performance.now() - m.t));
  room.onMessage("welcome", (m) => Object.assign(c, { x: m.spawn.x, z: m.spawn.z }));
  room.onMessage("correct", (m) => Object.assign(c, { x: m.x, z: m.z }));
  for (const t of ["chat", "portal", "error"]) room.onMessage(t, () => {});
  clients.push(c);
}
const joinedAt = Date.now();
const startHealth = await health();
for (const c of clients) c.patches = 0;

// Simulate players walking around (random headings, 3 m/s), sending moves at 12.5 Hz like browsers.
const moveTimer = setInterval(() => {
  for (const c of clients) {
    if (Math.random() < 0.05) c.a += (Math.random() - 0.5) * 2;
    c.x += Math.sin(c.a) * 3 * 0.08;
    c.z += Math.cos(c.a) * 3 * 0.08;
    if (Math.abs(c.x) > 18 || Math.abs(c.z) > 18) c.a += Math.PI;
    c.room.send("move", { seq: ++c.seq, x: c.x, z: c.z, rotY: c.a, anim: "walk" });
  }
}, 80);
const pingTimer = setInterval(
  () => clients.forEach((c) => c.room.send("ping", { t: performance.now() })),
  1000,
);

await sleep(SECONDS * 1000);
clearInterval(moveTimer);
clearInterval(pingTimer);
const endHealth = await health();
const elapsed = (Date.now() - joinedAt) / 1000;
const instances = new Set(clients.map((c) => c.room.roomId)).size;
const patchRates = clients.map((c) => c.patches / elapsed);
const cpuMs =
  endHealth.process.cpuUserMs +
  endHealth.process.cpuSystemMs -
  (startHealth.process.cpuUserMs + startHealth.process.cpuSystemMs);

const result = {
  date: new Date().toISOString(),
  zone: ZONE,
  clients: N,
  durationSeconds: Math.round(elapsed),
  instances,
  joinMs: { p50: round(pct(joinMs, 50)), p95: round(pct(joinMs, 95)), max: round(Math.max(...joinMs)) },
  rttMs: {
    p50: round(pct(rtt, 50)),
    p95: round(pct(rtt, 95)),
    max: round(Math.max(...rtt)),
    samples: rtt.length,
  },
  patchesPerClientPerSecond: {
    min: round(Math.min(...patchRates)),
    avg: round(patchRates.reduce((a, b) => a + b, 0) / N),
  },
  server: {
    cpuPercentOfOneCore: round((cpuMs / (elapsed * 1000)) * 100),
    rssMB: { before: before.process.rssMB, end: endHealth.process.rssMB },
    heapMB: endHealth.process.heapMB,
  },
  machine: `${process.platform} ${process.arch}, Node ${process.version}, server + clients on the same machine`,
};
console.log(JSON.stringify(result, null, 2));
mkdirSync(path.join(root, "tests/load/results"), { recursive: true });
writeFileSync(path.join(root, `tests/load/results/zone-${ZONE}-${N}c.json`), JSON.stringify(result, null, 2));

await Promise.all(clients.map((c) => Promise.race([c.room.leave(true).catch(() => {}), sleep(1000)])));
await sql`delete from player_profiles where id = any(${profiles.map((p) => p.id)})`;
await sql.end();
server?.kill();
process.exit(0);
