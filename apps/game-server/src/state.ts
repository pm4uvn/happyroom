import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Authoritative, delta-synchronised room state. Only data every participant may see lives here:
 * pending (unapproved) wishes are NOT part of state; they are sent privately to moderators.
 * Timestamps are server epoch milliseconds (0 = none).
 */
export const Player = schema(
  {
    id: t.string(), // room_participants.id
    name: t.string(),
    avatar: t.string(),
    role: t.string(),
    x: t.number(),
    z: t.number(),
    rotY: t.number(),
    moving: t.boolean(),
    /** Current emote id ("" = none) and a counter so the same emote twice restarts the animation. */
    emote: t.string(),
    emoteSeq: t.number(),
    connected: t.boolean(),
    muted: t.boolean(),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const Wish = schema(
  {
    id: t.string(),
    author: t.string(),
    body: t.string(),
    createdAt: t.number(),
  },
  "Wish",
);
export type Wish = SchemaType<typeof Wish>;

export const Gift = schema(
  {
    id: t.string(),
    catalogId: t.string(),
    sender: t.string(),
    senderId: t.string(),
    message: t.string(),
    opened: t.boolean(),
    createdAt: t.number(),
  },
  "Gift",
);
export type Gift = SchemaType<typeof Gift>;

export const Ceremony = schema(
  {
    phase: t.string(),
    run: t.number(),
    phaseStartedAt: t.number(),
    phaseEndsAt: t.number(),
    countdownEndsAt: t.number(),
    blownBy: t.string(),
    autoBlown: t.boolean(),
  },
  "Ceremony",
);
export type Ceremony = SchemaType<typeof Ceremony>;

export const PartyState = schema(
  {
    title: t.string(),
    honoree: t.string(),
    themeId: t.string(),
    cakeStyle: t.string(),
    decoration: t.string(),
    hostId: t.string(),
    locked: t.boolean(),
    giftsEnabled: t.boolean(),
    capacity: t.number(),
    // Public Explore dashboard opt-in (room.discovery, host-only). Not sensitive — same
    // visibility as `locked`/`giftsEnabled` above — so it is plain room state, not a private send.
    discoverable: t.boolean(),
    publicName: t.string(),
    publicCountry: t.string(),
    publicIntro: t.string(),
    acceptWishes: t.boolean(),
    showParticipantCount: t.boolean(),
    players: t.map(Player),
    wishes: t.array(Wish),
    gifts: t.array(Gift),
    ceremony: Ceremony,
  },
  "PartyState",
);
export type PartyState = SchemaType<typeof PartyState>;
