import "server-only";
import type { EventType, SupportedLocale } from "@happyroom/shared";
import type {
  DiscoveryResponse,
  ExploreSummary,
  PublicCelebration,
  SummaryMetric,
} from "@/features/explore/model";
import { getPresence } from "./presence";
import { demoCelebrations } from "./explore-demo";
import type { Db } from "./types";

/**
 * Public celebration discovery.
 *
 * A room is public ONLY after its host explicitly opts in (`rooms.discoverable = true`) and
 * gives it a separate public name + country (migration 20261106000005). An invite link never
 * makes a room public by itself. "Live" / "celebrating now" is never taken from `rooms.status`
 * alone — it requires confirmed presence from the game server (see lib/server/presence.ts), so a
 * room a host opened and abandoned never shows as happening now.
 */
export const DISCOVERY_ENABLED = true;

export function demoAvailable(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.EXPLORE_DEMO_ENABLED === "true";
}

interface DiscoverableRoomRow {
  id: string;
  public_name: string;
  public_country: string;
  event_type: EventType;
  locale: SupportedLocale;
  starts_at: Date | null;
  accept_wishes: boolean;
  show_participant_count: boolean;
  public_intro: string | null;
  capacity: number;
}

async function loadDiscoverableRooms(db: Db): Promise<DiscoverableRoomRow[]> {
  return db<DiscoverableRoomRow[]>`
    select id, public_name, public_country, event_type, locale, starts_at,
           accept_wishes, show_participant_count, public_intro, capacity
      from rooms
     where discoverable and deleted_at is null and status not in ('ended', 'archived', 'deleted')
       and expires_at > now()
     order by created_at desc
     limit 500`;
}

async function listLiveCelebrations(
  db: Db,
): Promise<{ celebrations: PublicCelebration[]; presenceAvailable: boolean }> {
  const [rows, presence] = await Promise.all([loadDiscoverableRooms(db), getPresence()]);
  const celebrations: PublicCelebration[] = [];
  for (const row of rows) {
    const clients = presence.ok ? (presence.clientsByRoomId.get(row.id) ?? 0) : null;
    const live = clients !== null && clients > 0;
    const scheduledInFuture = row.starts_at !== null && row.starts_at.getTime() > Date.now();
    // Never invented: a room with no confirmed presence and no real future start time is not
    // shown at all, rather than guessed as "live" or "upcoming" (prevents ghost rooms).
    if (!live && !scheduledInFuture) continue;
    celebrations.push({
      id: row.id,
      name: row.public_name,
      celebrationType: row.event_type,
      countryCode: row.public_country,
      language: row.locale,
      status: live ? "live" : "upcoming",
      startsAt: row.starts_at?.toISOString() ?? null,
      participantCount: row.show_participant_count && clients !== null ? clients : null,
      capacity: row.capacity,
      intro: row.public_intro,
      acceptingWishes: row.accept_wishes,
    });
  }
  return { celebrations, presenceAvailable: presence.ok };
}

export async function getDiscovery(db: Db, opts: { demo: boolean }): Promise<DiscoveryResponse> {
  const allowDemo = demoAvailable();
  if (opts.demo && allowDemo) {
    return {
      mode: "demo",
      discoveryEnabled: DISCOVERY_ENABLED,
      demoAvailable: true,
      celebrations: demoCelebrations(),
      presenceAvailable: true,
    };
  }
  const { celebrations, presenceAvailable } = await listLiveCelebrations(db);
  return {
    mode: "live",
    discoveryEnabled: DISCOVERY_ENABLED,
    demoAvailable: allowDemo,
    celebrations,
    presenceAvailable,
  };
}

const unavailable: SummaryMetric = { value: null, status: "unavailable" };
const metric = (value: number): SummaryMetric => ({ value, status: "ok" });

/**
 * The four Explore summary numbers. Each is defined precisely because "celebrating" is ambiguous:
 *  - celebratingNow / peopleCelebrating / countriesCelebrating: discoverable rooms with at least
 *    one connected client right now (confirmed game-server presence), and the sum of their
 *    clients, and the number of distinct host-chosen countries among them.
 *  - wishesShared: approved wishes (pending ones are not "shared" yet) whose room is currently
 *    discoverable — all-time, not just this session; a room that opts out stops counting.
 * Demo mode returns the same shape computed from the demo fixtures, clearly labelled `mode`.
 */
export async function getExploreSummary(db: Db, opts: { demo: boolean }): Promise<ExploreSummary> {
  const updatedAt = new Date().toISOString();
  if (opts.demo && demoAvailable()) {
    const demo = demoCelebrations();
    const live = demo.filter((c) => c.status === "live");
    return {
      mode: "demo",
      celebratingNow: metric(live.length),
      peopleCelebrating: unavailable, // demo rooms never claim a fake participant count
      countriesCelebrating: metric(new Set(live.map((c) => c.countryCode)).size),
      wishesShared: unavailable,
      updatedAt,
    };
  }
  const [rows, presence, wishRows] = await Promise.all([
    loadDiscoverableRooms(db),
    getPresence(),
    db<{ n: number }[]>`
      select count(*)::int as n
        from wishes w
        join rooms r on r.id = w.room_id
       where w.status = 'approved' and w.deleted_at is null
         and r.discoverable and r.deleted_at is null`,
  ]);
  if (!presence.ok) {
    return {
      mode: "live",
      celebratingNow: unavailable,
      peopleCelebrating: unavailable,
      countriesCelebrating: unavailable,
      wishesShared: metric(wishRows[0]?.n ?? 0),
      updatedAt,
    };
  }
  let people = 0;
  const countries = new Set<string>();
  let now = 0;
  for (const row of rows) {
    const clients = presence.clientsByRoomId.get(row.id) ?? 0;
    if (clients <= 0) continue;
    now += 1;
    people += clients;
    countries.add(row.public_country);
  }
  return {
    mode: "live",
    celebratingNow: metric(now),
    peopleCelebrating: metric(people),
    countriesCelebrating: metric(countries.size),
    wishesShared: metric(wishRows[0]?.n ?? 0),
    updatedAt,
  };
}
