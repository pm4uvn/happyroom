import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/db";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

/**
 * GET /api/health          liveness: 200 while the process can serve requests (dependency states reported).
 * GET /api/health?ready=1  readiness: 503 when a *configured* dependency is unavailable.
 */
export async function GET(request: Request) {
  const ready = new URL(request.url).searchParams.has("ready");
  const database = await checkDatabase();
  const degraded = database === "unavailable";
  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      service: "web",
      version: serverEnv().APP_VERSION ?? "dev",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks: { database },
    },
    { status: ready && degraded ? 503 : 200 },
  );
}
