import { NextResponse } from "next/server";
import { ingestAnalytics } from "@/lib/analytics/ingest";
import { logger } from "@/lib/logger";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

/** First-party, privacy-conscious analytics ingestion. Schema: packages/shared/src/analytics.ts */
export async function POST(request: Request) {
  const limit = rateLimit("analyticsIngest", clientKey(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await ingestAnalytics(body);
    if (result.status === "invalid") return NextResponse.json({ error: "invalid_batch" }, { status: 400 });
    if (result.status === "unavailable") {
      return NextResponse.json({ error: "analytics_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ accepted: result.accepted, rejected: result.rejected }, { status: 202 });
  } catch (err) {
    logger.error("analytics ingest failed", { err });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
