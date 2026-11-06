import { sendPublicWishInputSchema } from "@happyroom/shared";
import { sendPublicWish } from "@/lib/server/public-wishes";
import { errorJson, json, limit, parseBody, withDb } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const STATUS_BY_ERROR = {
  not_found: 404,
  wishes_disabled: 403,
  ended: 410,
  blocked_content: 422,
} as const;

/**
 * POST /api/explore/wishes — send congratulations from the Explore dashboard, without joining
 * the private 3D room. Always lands as `pending`: a human (the host, inside the party room) must
 * approve it before it is shown anywhere. Creates a guest session (hr_guest cookie) the same way
 * joining a room does, so repeat submissions can be rate-limited per visitor, not just per IP.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, sendPublicWishInputSchema);
  if (!body.ok) return body.response;

  const limited = limit(request, "publicWish", body.data.roomId);
  if (limited) return limited;

  return withDb("POST /api/explore/wishes", async (db) => {
    const result = await sendPublicWish(db, body.data);
    if (!result.ok) return errorJson(result.error, STATUS_BY_ERROR[result.error]);
    return json({ ok: true, status: result.status }, 201);
  });
}
