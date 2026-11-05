import { errorJson, json, withDb } from "@/lib/server/http";
import { getPublishedZone } from "@/lib/server/world";

export const dynamic = "force-dynamic";

/** GET /api/world/zones/:zoneId — full zone definition for the client ZoneLoader. */
export async function GET(_req: Request, { params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await params;
  return withDb("GET /api/world/zones/:id", async (db) => {
    const zone = await getPublishedZone(db, zoneId);
    return zone ? json({ zone }) : errorJson("zone_not_found", 404);
  });
}
