import { describe, expect, it } from "vitest";
import { can, canJoin, type ActorContext, type RoomAction } from "./permissions.js";

const room = { locked: false, giftsEnabled: true, chatEnabled: true };
const host: ActorContext = { participantId: "h", role: "host", muted: false };
const cohost: ActorContext = { participantId: "c", role: "cohost", muted: false };
const guest: ActorContext = { participantId: "g", role: "guest", muted: false };

describe("room permissions", () => {
  it("restricts ceremony control, gift opening, lock and invites to the host", () => {
    const hostOnly: RoomAction[] = [
      "ceremony.control",
      "gift.open",
      "room.lock",
      "room.toggleGifts",
      "invite.create",
    ];
    for (const action of hostOnly) {
      expect(can(host, action, room).ok).toBe(true);
      expect(can(cohost, action, room).ok).toBe(false);
      expect(can(guest, action, room).ok).toBe(false);
    }
  });

  it("lets host and cohost moderate guests, but never the host", () => {
    expect(can(host, "moderation.kick", room, { participantId: "g", role: "guest" }).ok).toBe(true);
    expect(can(cohost, "moderation.kick", room, { participantId: "g", role: "guest" }).ok).toBe(true);
    expect(can(cohost, "moderation.kick", room, { participantId: "h", role: "host" })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(can(cohost, "moderation.kick", room, { participantId: "c2", role: "cohost" }).ok).toBe(false);
    expect(can(guest, "moderation.mute", room, { participantId: "g2", role: "guest" }).ok).toBe(false);
  });

  it("prevents self-targeting", () => {
    expect(can(host, "moderation.ban", room, { participantId: "h", role: "host" })).toEqual({
      ok: false,
      code: "self_target",
    });
  });

  it("blocks muted participants from speech actions but not emotes", () => {
    const muted = { ...guest, muted: true };
    expect(can(muted, "chat.send", room)).toEqual({ ok: false, code: "muted" });
    expect(can(muted, "wish.send", room)).toEqual({ ok: false, code: "muted" });
    expect(can(muted, "gift.send", room)).toEqual({ ok: false, code: "muted" });
    expect(can(muted, "emote.send", room).ok).toBe(true);
  });

  it("honours room-wide gift and chat switches", () => {
    expect(can(guest, "gift.send", { ...room, giftsEnabled: false })).toEqual({
      ok: false,
      code: "gifts_disabled",
    });
    expect(can(guest, "chat.send", { ...room, chatEnabled: false })).toEqual({
      ok: false,
      code: "chat_disabled",
    });
    expect(can(host, "chat.send", { ...room, chatEnabled: false }).ok).toBe(true);
  });
});

describe("canJoin", () => {
  const base = {
    role: "guest" as const,
    locked: false,
    banned: false,
    activeCount: 3,
    capacity: 20,
    alreadyPresent: false,
  };
  it("rejects banned users", () => {
    expect(canJoin({ ...base, banned: true })).toEqual({ ok: false, code: "banned" });
  });
  it("rejects new guests when locked or full", () => {
    expect(canJoin({ ...base, locked: true })).toEqual({ ok: false, code: "room_locked" });
    expect(canJoin({ ...base, activeCount: 20 })).toEqual({ ok: false, code: "room_full" });
  });
  it("lets the host and reconnecting participants in", () => {
    expect(canJoin({ ...base, role: "host", locked: true, activeCount: 20 })).toEqual({ ok: true });
    expect(canJoin({ ...base, locked: true, alreadyPresent: true })).toEqual({ ok: true });
  });
});
