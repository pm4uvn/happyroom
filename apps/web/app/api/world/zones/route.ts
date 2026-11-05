import { json, withDb } from "@/lib/server/http";
import { listPublishedZones } from "@/lib/server/world";

export const dynamic = "force-dynamic";

/** GET /api/world/zones — published public zones (private birthday parties are never listed). */
export async function GET() {
  return withDb("GET /api/world/zones", async (db) => json({ zones: await listPublishedZones(db) }));
}
