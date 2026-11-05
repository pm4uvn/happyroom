import { NextResponse } from "next/server";
import { errorJson } from "@/lib/server/http";
import { googleConfig } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/start — redirect to Supabase Auth's Google provider.
 * Requires AUTH_GOOGLE_ENABLED=true and the Google provider configured in the Supabase dashboard
 * (with <app>/auth/callback as an allowed redirect URL). Unverified until configured.
 */
export async function GET(request: Request) {
  const cfg = googleConfig();
  if (!cfg) return errorJson("not_configured", 503);
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const target = new URL(`${cfg.url}/auth/v1/authorize`);
  target.searchParams.set("provider", "google");
  target.searchParams.set("redirect_to", `${origin}/auth/callback`);
  return NextResponse.redirect(target);
}
