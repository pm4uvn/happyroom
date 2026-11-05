import "server-only";
import { analyticsBatchSchema, parseAnalyticsEvent, type ParsedAnalyticsEvent } from "@happyroom/shared";
import { getDb } from "../db";

export type IngestResult =
  | { status: "accepted"; accepted: number; rejected: number }
  | { status: "invalid" }
  | { status: "unavailable" };

/** Validate a batch and persist the valid events. Invalid events are dropped, never stored. */
export async function ingestAnalytics(body: unknown, now = new Date()): Promise<IngestResult> {
  const batch = analyticsBatchSchema.safeParse(body);
  if (!batch.success) return { status: "invalid" };

  const valid: ParsedAnalyticsEvent[] = [];
  for (const raw of batch.data.events) {
    const parsed = parseAnalyticsEvent(raw);
    if (!parsed.success) continue;
    const occurred = Date.parse(parsed.data.occurredAt);
    // Drop events with implausible client clocks (> 5 min ahead or > 7 days old).
    if (occurred > now.getTime() + 5 * 60_000 || occurred < now.getTime() - 7 * 86_400_000) continue;
    valid.push(parsed.data);
  }
  const rejected = batch.data.events.length - valid.length;
  if (valid.length === 0) return { status: "accepted", accepted: 0, rejected };

  const db = getDb();
  if (!db) return { status: "unavailable" };

  const rows = valid.map((e) => ({
    event_name: e.name,
    occurred_at: new Date(e.occurredAt),
    anonymous_id: e.anonymousId ?? null,
    room_id: typeof e.properties.roomId === "string" ? e.properties.roomId : null,
    device_class: e.deviceClass ?? null,
    locale: e.locale ?? null,
    source: "web",
    properties: db.json(e.properties as Parameters<typeof db.json>[0]),
  }));
  await db`insert into analytics_events ${db(rows)}`;
  return { status: "accepted", accepted: valid.length, rejected };
}
