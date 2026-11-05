import postgres from "postgres";

/**
 * Privileged database access for the authoritative server. Only low-frequency facts are written
 * (joins, wishes, gifts, ceremony transitions, moderation) — never positions or emotes.
 */
export type Sql = ReturnType<typeof postgres>;

let sql: Sql | null = null;

export function connectDb(url: string): Sql {
  sql ??= postgres(url, {
    max: Number(process.env.GAME_DB_POOL_MAX ?? 5),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: !url.includes(":6543"),
    onnotice: () => {},
  });
  return sql;
}

export function db(): Sql {
  if (!sql) throw new Error("database not connected");
  return sql;
}

export async function closeDb() {
  await sql?.end({ timeout: 5 });
  sql = null;
}

export interface RoomRow {
  id: string;
  slug: string;
  title: string;
  honoree_name: string;
  theme_id: string;
  cake_style: string;
  decoration: string;
  status: string;
  locked: boolean;
  gifts_enabled: boolean;
  capacity: number;
  expires_at: Date;
  host_participant_id: string | null;
}

export async function loadRoom(roomId: string): Promise<RoomRow | null> {
  const rows = await db()<RoomRow[]>`
    select r.id, r.slug, r.title, r.honoree_name, r.theme_id, r.cake_style, r.decoration, r.status,
           r.locked, r.gifts_enabled, r.capacity, r.expires_at,
           (select p.id from room_participants p where p.room_id = r.id and p.role = 'host') as host_participant_id
      from rooms r
     where r.id = ${roomId} and r.deleted_at is null`;
  return rows[0] ?? null;
}

/** Returns why a participant may not (re)join, or null if allowed. */
export async function participantBlock(
  roomId: string,
  participantId: string,
): Promise<"removed" | "banned" | "unknown" | null> {
  const rows = await db()`
    select p.removed_at, p.guest_session_id, p.user_id,
           exists (
             select 1 from room_bans b
              where b.room_id = p.room_id
                and (b.guest_session_id = p.guest_session_id or b.user_id = p.user_id)
                and (b.expires_at is null or b.expires_at > now())
           ) as banned
      from room_participants p
     where p.id = ${participantId} and p.room_id = ${roomId}`;
  const row = rows[0];
  if (!row) return "unknown";
  if (row.banned) return "banned";
  if (row.removed_at) return "removed";
  return null;
}

export async function recordAnalytics(
  name: string,
  roomId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  try {
    await db()`insert into analytics_events (event_name, occurred_at, room_id, source, properties)
               values (${name}, now(), ${roomId}, 'game_server', ${db().json(properties as never)})`;
  } catch {
    /* analytics must never break gameplay */
  }
}
