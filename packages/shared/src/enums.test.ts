import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENT_NAMES } from "./analytics.js";
import * as E from "./enums.js";

const migration = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20261104000001_core_schema.sql", import.meta.url)),
  "utf8",
);

function sqlEnum(name: string): string[] {
  const m = migration.match(new RegExp(`create type public\\.${name} as enum \\(([^)]*)\\)`));
  if (!m?.[1]) throw new Error(`enum ${name} not found in migration`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]!);
}

describe("TypeScript ↔ PostgreSQL enum parity", () => {
  const pairs: [string, readonly string[]][] = [
    ["event_type", E.EVENT_TYPES],
    ["room_status", E.ROOM_STATUSES],
    ["room_privacy", E.ROOM_PRIVACY],
    ["participant_role", E.PARTICIPANT_ROLES],
    ["ceremony_phase", E.CEREMONY_PHASES],
    ["moderation_status", E.MODERATION_STATUSES],
    ["room_gift_status", E.ROOM_GIFT_STATUSES],
    ["media_kind", E.MEDIA_KINDS],
    ["media_status", E.MEDIA_STATUSES],
    ["report_target_type", E.REPORT_TARGET_TYPES],
    ["report_reason", E.REPORT_REASONS],
    ["report_status", E.REPORT_STATUSES],
    ["order_status", E.ORDER_STATUSES],
    ["product_kind", E.PRODUCT_KINDS],
  ];
  it.each(pairs)("%s matches", (name, values) => {
    expect(sqlEnum(name)).toEqual([...values]);
  });

  it("analytics event names match the table check constraint", () => {
    for (const name of ANALYTICS_EVENT_NAMES) expect(migration).toContain(`'${name}'`);
  });

  it("avatar preset check constraints list every preset", () => {
    for (const id of E.AVATAR_PRESET_IDS) expect(migration).toContain(`'${id}'`);
  });
});
