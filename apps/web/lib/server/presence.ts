import "server-only";
import { serverEnv } from "../env";

/**
 * Presence of live party rooms, read from the game server's authoritative in-memory state
 * (never from `rooms.status`, which only reflects what a host last did — not who is actually
 * connected right now). Cached for a few seconds per process so a burst of landing-page loads
 * does not hammer the game server.
 */
export type PresenceSnapshot = { ok: true; clientsByRoomId: Map<string, number> } | { ok: false };

const CACHE_TTL_MS = 4000;
const FETCH_TIMEOUT_MS = 2500;
let cached: { at: number; snapshot: PresenceSnapshot } | null = null;

function internalBaseUrl(): string | null {
  const ws = serverEnv().GAME_SERVER_PUBLIC_URL;
  // The game server's internal HTTP routes are served on the same host/port as its WebSocket
  // transport; this call stays server-to-server and is never exposed to the browser.
  const match = /^wss?:\/\/(.+)$/.exec(ws);
  if (!match) return null;
  return `${ws.startsWith("wss") ? "https" : "http"}://${match[1]}`;
}

async function fetchPresence(): Promise<PresenceSnapshot> {
  const base = internalBaseUrl();
  const key = serverEnv().JOIN_GRANT_SIGNING_KEY;
  if (!base || !key) return { ok: false };
  try {
    const res = await fetch(`${base}/internal/presence`, {
      headers: { "x-internal-key": key },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { partyRooms: { roomId: string; clients: number }[] };
    return { ok: true, clientsByRoomId: new Map(body.partyRooms.map((r) => [r.roomId, r.clients])) };
  } catch {
    return { ok: false };
  }
}

/** Returns `{ ok: false }` when the game server is unreachable — never a faked empty snapshot. */
export async function getPresence(): Promise<PresenceSnapshot> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.snapshot;
  const snapshot = await fetchPresence();
  // Never cache a failure for long: the next request should retry soon.
  cached = { at: now, snapshot: snapshot.ok ? snapshot : snapshot };
  if (!snapshot.ok) cached.at = now - CACHE_TTL_MS + 1000; // retry in ~1s instead of the full TTL
  return snapshot;
}

export function __resetPresenceCacheForTests() {
  cached = null;
}
