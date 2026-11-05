import { z } from "zod";
import { json, parseBody, withDb } from "@/lib/server/http";
import {
  ageBandField,
  avatarField,
  displayNameField,
  publicProfile,
  readPlayer,
  requirePlayer,
  updateProfile,
} from "@/lib/server/player-auth";

export const dynamic = "force-dynamic";

/** GET /api/profile — the signed-in player's own profile (null when signed out). */
export async function GET() {
  return withDb("GET /api/profile", async (db) => {
    const p = await readPlayer(db);
    return json({ profile: p ? publicProfile(p) : null });
  });
}

const updateSchema = z.object({
  displayName: displayNameField,
  avatar: avatarField,
  ageBand: ageBandField,
  chatEnabled: z.boolean().optional(),
  showInPlayerList: z.boolean().optional(),
});

/** PUT /api/profile — character selection / settings. Display names are unique (case-insensitive). */
export async function PUT(request: Request) {
  const body = await parseBody(request, updateSchema);
  if (!body.ok) return body.response;
  return withDb("PUT /api/profile", async (db) => {
    const p = await requirePlayer(db);
    const updated = await updateProfile(db, p, body.data);
    return json({ profile: publicProfile(updated) });
  });
}
