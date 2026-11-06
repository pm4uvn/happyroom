import { NextResponse } from "next/server";
import { getDiscovery } from "@/lib/server/discovery";

export const dynamic = "force-dynamic";

/**
 * GET /api/explore/celebrations          public celebrations (opted-in rooms only; empty today)
 * GET /api/explore/celebrations?demo=1   clearly-labelled demo fixtures (non-production only,
 *                                        or EXPLORE_DEMO_ENABLED=true)
 * The response never contains slugs, invitation tokens, access codes, personal names or coordinates.
 */
export async function GET(request: Request) {
  const demo = new URL(request.url).searchParams.get("demo") === "1";
  return NextResponse.json(await getDiscovery({ demo }));
}
