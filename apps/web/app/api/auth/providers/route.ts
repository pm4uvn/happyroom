import { json } from "@/lib/server/http";
import { googleConfig } from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

/** Which sign-in methods are actually available in this deployment (never claims unconfigured OAuth). */
export async function GET() {
  return json({ guest: true, password: true, google: googleConfig() !== null });
}
