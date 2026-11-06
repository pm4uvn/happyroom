import { getExploreSummary } from "@/lib/server/discovery";
import { json, limit, withDb } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/explore/summary          celebratingNow / peopleCelebrating / countriesCelebrating /
 *                                    wishesShared for public celebrations (see discovery.ts for
 *                                    each metric's exact definition). Each number is either a real
 *                                    count or `{ value: null, status: "unavailable" }` — never a
 *                                    faked zero when its data source (game-server presence) is down.
 * GET /api/explore/summary?demo=1   the same shape computed from demo fixtures.
 */
export async function GET(request: Request) {
  const limited = limit(request, "exploreSummary");
  if (limited) return limited;
  const demo = new URL(request.url).searchParams.get("demo") === "1";
  return withDb("GET /api/explore/summary", async (db) => json(await getExploreSummary(db, { demo })));
}
