import "server-only";
import { containsLink, screenProfanity, type SendPublicWishInput } from "@happyroom/shared";
import { ensureGuestSession } from "./guest-session";
import type { Db } from "./types";

export type SendPublicWishResult =
  | { ok: true; status: "pending" }
  | { ok: false; error: "not_found" | "wishes_disabled" | "ended" | "blocked_content" };

interface RoomEligibility {
  id: string;
  discoverable: boolean;
  accept_wishes: boolean;
  status: string;
  expires_at: Date;
}

/**
 * Sends a public "congratulations" from the Explore dashboard — no 3D room, no join grant, not
 * even a `room_participants` row. The wish is always inserted as `pending` (public visitors are
 * never auto-approved, unlike in-room host/cohost wishes) and only reaches anyone once a
 * moderator (the host, inside the party room) approves it — the same approval path and the same
 * `wishes` table the party room already uses, so nothing new has to read it.
 */
export async function sendPublicWish(db: Db, input: SendPublicWishInput): Promise<SendPublicWishResult> {
  const [room] = await db<RoomEligibility[]>`
    select id, discoverable, accept_wishes, status, expires_at from rooms
     where id = ${input.roomId} and deleted_at is null`;
  // A non-discoverable or missing room looks identical to the caller: existence of a private
  // room is not public information.
  if (!room || !room.discoverable) return { ok: false, error: "not_found" };
  if (["ended", "archived", "deleted"].includes(room.status) || room.expires_at.getTime() < Date.now()) {
    return { ok: false, error: "ended" };
  }
  if (!room.accept_wishes) return { ok: false, error: "wishes_disabled" };

  // `body` is already sanitised and length-bounded by sendPublicWishInputSchema; this is an
  // additional content floor, not the only line of defence (React/canvas text never renders UGC
  // as HTML either way).
  if (containsLink(input.body) || containsLink(input.displayName))
    return { ok: false, error: "blocked_content" };
  const screened = screenProfanity(input.body);
  if (!screened.ok) return { ok: false, error: "blocked_content" };

  const session = await ensureGuestSession(db);
  const [inserted] = await db<{ id: string; status: string }[]>`
    insert into wishes (room_id, author_participant_id, author_display_name, body, status, source, visitor_guest_session_id, idempotency_key)
    values (${input.roomId}, null, ${input.displayName}, ${screened.text}, 'pending', 'public', ${session.id}, ${input.idempotencyKey})
    on conflict (room_id, idempotency_key) where idempotency_key is not null do nothing
    returning id, status`;
  if (inserted) return { ok: true, status: "pending" };
  // A retried submit with the same idempotency key lands once; report the existing row's state.
  const [existing] = await db<{ status: string }[]>`
    select status from wishes where room_id = ${input.roomId} and idempotency_key = ${input.idempotencyKey}`;
  return { ok: true, status: (existing?.status as "pending") ?? "pending" };
}
