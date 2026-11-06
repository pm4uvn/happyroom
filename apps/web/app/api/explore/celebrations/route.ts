import { getDiscovery } from "@/lib/server/discovery";
import { json, withDb } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/explore/celebrations          public celebrations: opted-in rooms with confirmed
 *                                         presence ("live") or a real future start ("upcoming")
 * GET /api/explore/celebrations?demo=1   clearly-labelled demo fixtures (non-production only,
 *                                        or EXPLORE_DEMO_ENABLED=true)
 * The response never contains slugs, invitation tokens, access codes, personal names or coordinates.
 */
export async function GET(request: Request) {
  const demo = new URL(request.url).searchParams.get("demo") === "1";
  return withDb("GET /api/explore/celebrations", async (db) => json(await getDiscovery(db, { demo })));
}
