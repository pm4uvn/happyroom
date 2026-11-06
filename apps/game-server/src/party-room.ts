import { Room, ServerError, type AuthContext, type Client } from "@colyseus/core";
import {
  blowCandles,
  can,
  canJoin,
  chooseSpawnPoint,
  createCeremonyState,
  normalizeAngle,
  restartCeremony,
  startCeremony,
  tickCeremony,
  TokenBucketLimiter,
  validateMove,
  type CeremonyState,
  type RoomAction,
} from "@happyroom/game-core";
import {
  BIRTHDAY_ROOM,
  EMOTES,
  joinOptionsSchema,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  parseClientMessage,
  PROTOCOL_VERSION,
  RATE_LIMITS,
  type ClientMessageType,
  type EmoteId,
  type ParticipantRole,
  type ProtocolErrorCode,
} from "@happyroom/shared";
import { verifyJoinGrant, type JoinGrantPayload } from "@happyroom/shared/grant";
import { z } from "zod";
import { db, loadRoom, participantBlock, recordAnalytics } from "./db.js";
import { log } from "./logger.js";
import { Ceremony, Gift, PartyState, Player, Wish } from "./state.js";

/** Custom WebSocket close codes sent to clients (4000–4999 are application-defined). */
export const CLOSE = {
  replaced: 4001,
  kicked: 4003,
  idle: 4004,
} as const;

const IDLE_TIMEOUT_MS = 30 * 60_000;
const RECONNECT_SECONDS = 30;
const MAX_WISHES_IN_STATE = 100;
const MAX_GIFTS_IN_STATE = 120;

interface Session {
  participantId: string;
  role: ParticipantRole;
  name: string;
  lastMove: { x: number; z: number; t: number };
  lastActivity: number;
}

export interface PartyRoomOptions {
  partyId: string;
}

let grantKey = "";
/** Set once at boot (index.ts) so the room class needs no global config import. */
export function configurePartyRoom(opts: { grantKey: string }) {
  grantKey = opts.grantKey;
}

export class PartyRoom extends Room<{ state: PartyState }> {
  private dbRoomId = "";
  // Public wishes arrive over HTTP (apps/web), not through this room's own "wish" message, so
  // moderators only learn about them via sendPendingWishes() on join unless we poll for new ones.
  private lastPublicWishCheck = new Date(0);
  private sessions = new Map<string, Session>(); // sessionId → session
  private ceremony: CeremonyState = createCeremonyState(Date.now());
  private ceremonyRowId: string | null = null;
  private emoteUntil = new Map<string, number>(); // participantId → ms
  private limiters = {
    move: new TokenBucketLimiter({ points: 40, windowSeconds: 1 }),
    emote: new TokenBucketLimiter(RATE_LIMITS.emote),
    wish: new TokenBucketLimiter(RATE_LIMITS.wish),
    gift: new TokenBucketLimiter(RATE_LIMITS.gift),
    action: new TokenBucketLimiter({ points: 20, windowSeconds: 10 }),
  };

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  override async onCreate(options: PartyRoomOptions) {
    const roomId = z.uuid().safeParse(options?.partyId);
    if (!roomId.success) throw new ServerError(400, "invalid_room");
    const row = await loadRoom(roomId.data);
    if (!row || ["archived", "deleted"].includes(row.status) || row.expires_at.getTime() < Date.now()) {
      throw new ServerError(404, "room_not_found");
    }
    this.dbRoomId = row.id;
    // One Colyseus room instance per party: the instance id IS the party id, so a concurrent
    // second create for the same party fails instead of silently splitting the party in two.
    this.roomId = row.id;
    // Capacity is enforced in onAuth (hosts and reconnecting participants may exceed it); the
    // transport limit is only a safety net. If maxClients == capacity, Colyseus would auto-lock a
    // full room and joinOrCreate would spawn a second instance of the same party.
    this.maxClients = row.capacity + 5;
    this.setPatchRate(50); // 20 Hz

    const state = new PartyState();
    state.title = row.title;
    state.honoree = row.honoree_name;
    state.themeId = row.theme_id;
    state.cakeStyle = row.cake_style;
    state.decoration = row.decoration;
    state.hostId = row.host_participant_id ?? "";
    state.locked = row.locked;
    state.giftsEnabled = row.gifts_enabled;
    state.capacity = row.capacity;
    state.discoverable = row.discoverable;
    state.publicName = row.public_name ?? "";
    state.publicCountry = row.public_country ?? "";
    state.publicIntro = row.public_intro ?? "";
    state.acceptWishes = row.accept_wishes;
    state.showParticipantCount = row.show_participant_count;
    state.ceremony = new Ceremony();
    this.setState(state);
    this.syncCeremony();

    const wishes = await db()`
      select id, author_display_name, body, created_at from wishes
       where room_id = ${row.id} and status = 'approved' and deleted_at is null
       order by created_at desc limit ${MAX_WISHES_IN_STATE}`;
    for (const w of [...wishes].reverse()) {
      state.wishes.push(
        new Wish({
          id: w.id,
          author: w.author_display_name,
          body: w.body,
          createdAt: w.created_at.getTime(),
        }),
      );
    }
    const gifts = await db()`
      select id, catalog_id, sender_display_name, sender_participant_id, message, status, created_at from room_gifts
       where room_id = ${row.id} and status <> 'removed'
       order by created_at desc limit ${MAX_GIFTS_IN_STATE}`;
    for (const g of [...gifts].reverse()) {
      state.gifts.push(
        new Gift({
          id: g.id,
          catalogId: g.catalog_id,
          sender: g.sender_display_name,
          senderId: g.sender_participant_id ?? "",
          message: g.message ?? "",
          opened: g.status === "opened",
          createdAt: g.created_at.getTime(),
        }),
      );
    }

    this.registerMessages();
    this.clock.setInterval(() => this.tick(), 100);
    this.lastPublicWishCheck = new Date();
    this.clock.setInterval(() => void this.pollPublicWishes(), 5000);
    log.info("room created", { roomId: row.id });
  }

  override async onAuth(client: Client, options: unknown, _context: AuthContext): Promise<JoinGrantPayload> {
    const opts = joinOptionsSchema.safeParse(options);
    if (!opts.success) throw new ServerError(400, "invalid_payload");
    if (
      opts.data.protocolVersion < MIN_SUPPORTED_PROTOCOL_VERSION ||
      opts.data.protocolVersion > PROTOCOL_VERSION
    ) {
      throw new ServerError(426, "client_outdated");
    }
    const verified = verifyJoinGrant(opts.data.grant, grantKey);
    if (!verified.ok) throw new ServerError(401, "unauthorized");
    const grant = verified.payload;
    if (grant.roomId !== this.dbRoomId || opts.data.partyId !== this.dbRoomId)
      throw new ServerError(403, "forbidden");

    const block = await participantBlock(this.dbRoomId, grant.participantId);
    if (block === "banned" || block === "removed") throw new ServerError(403, "banned");
    if (block === "unknown") throw new ServerError(403, "forbidden");

    const alreadyPresent = this.state.players.has(grant.participantId);
    const activeCount = [...this.state.players.values()].filter((p) => p.connected).length;
    const allowed = canJoin({
      role: grant.role,
      locked: this.state.locked,
      banned: false,
      activeCount,
      capacity: this.state.capacity,
      alreadyPresent,
    });
    if (!allowed.ok) throw new ServerError(403, allowed.code);
    return grant;
  }

  override onJoin(client: Client, _options: unknown, grant: JoinGrantPayload) {
    // A participant can only be connected once: a new tab replaces the old connection.
    for (const [sid, s] of this.sessions) {
      if (s.participantId === grant.participantId && sid !== client.sessionId) {
        this.sessions.delete(sid);
        this.clients.find((c) => c.sessionId === sid)?.leave(CLOSE.replaced);
      }
    }

    let player = this.state.players.get(grant.participantId);
    if (!player) {
      const occupied = [...this.state.players.values()].map((p) => ({ x: p.x, z: p.z }));
      const spawn = chooseSpawnPoint(BIRTHDAY_ROOM, occupied);
      player = new Player({
        id: grant.participantId,
        name: grant.displayName,
        avatar: grant.avatar,
        role: grant.role,
        x: spawn.x,
        z: spawn.z,
        rotY: Math.PI, // face into the room (towards -Z)
        moving: false,
        emote: "",
        emoteSeq: 0,
        connected: true,
        muted: false,
      });
      this.state.players.set(grant.participantId, player);
    }
    player.connected = true;
    player.name = grant.displayName;
    player.avatar = grant.avatar;
    player.role = grant.role;

    const now = Date.now();
    this.sessions.set(client.sessionId, {
      participantId: grant.participantId,
      role: grant.role,
      name: grant.displayName,
      lastMove: { x: player.x, z: player.z, t: now },
      lastActivity: now,
    });

    client.send("welcome", {
      participantId: grant.participantId,
      serverTime: now,
      protocolVersion: PROTOCOL_VERSION,
    });
    if (grant.role === "host" || grant.role === "cohost") void this.sendPendingWishes(client);
    void this.touchParticipant(grant.participantId);
    log.info("player joined", {
      roomId: this.dbRoomId,
      participantId: grant.participantId,
      role: grant.role,
    });
  }

  override async onDrop(client: Client) {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    const p = this.state.players.get(s.participantId);
    if (p) {
      p.connected = false;
      p.moving = false;
    }
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      /* reconnection window expired → onLeave handles cleanup */
    }
  }

  override onReconnect(client: Client) {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    const p = this.state.players.get(s.participantId);
    if (p) p.connected = true;
    s.lastActivity = Date.now();
    client.send("welcome", {
      participantId: s.participantId,
      serverTime: Date.now(),
      protocolVersion: PROTOCOL_VERSION,
    });
    log.info("player reconnected", { roomId: this.dbRoomId, participantId: s.participantId });
  }

  override onLeave(client: Client) {
    const s = this.sessions.get(client.sessionId);
    if (!s) return; // replaced by a newer connection
    this.sessions.delete(client.sessionId);
    const stillConnected = [...this.sessions.values()].some((x) => x.participantId === s.participantId);
    if (!stillConnected) this.state.players.delete(s.participantId);
    void this.touchParticipant(s.participantId);
    log.info("player left", { roomId: this.dbRoomId, participantId: s.participantId });
  }

  override onDispose() {
    log.info("room disposed", { roomId: this.dbRoomId });
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------
  private on<T extends ClientMessageType>(
    type: T,
    handler: (
      client: Client,
      session: Session,
      msg: NonNullable<ReturnType<typeof parseClientMessage<T>>["data"]>,
    ) => unknown,
  ) {
    this.onMessage(type, (client: Client, raw: unknown) => {
      const session = this.sessions.get(client.sessionId);
      if (!session) return;
      const parsed = parseClientMessage(type, raw ?? {});
      if (!parsed.success) return this.fail(client, type, "invalid_payload");
      if (type !== "move" && type !== "ping") session.lastActivity = Date.now();
      try {
        const r = handler(client, session, parsed.data as never);
        if (r instanceof Promise) {
          r.catch((err) => {
            log.error("message handler failed", { type, err });
            this.fail(client, type, "invalid_transition");
          });
        }
      } catch (err) {
        log.error("message handler failed", { type, err });
      }
    });
  }

  private fail(client: Client, action: string, code: ProtocolErrorCode) {
    client.send("error", { action, code });
  }

  private actor(s: Session) {
    const p = this.state.players.get(s.participantId);
    return { participantId: s.participantId, role: s.role, muted: p?.muted ?? false };
  }

  private policy() {
    return { locked: this.state.locked, giftsEnabled: this.state.giftsEnabled, chatEnabled: true };
  }

  private allow(
    client: Client,
    s: Session,
    action: RoomAction,
    target?: { participantId: string; role: ParticipantRole },
  ) {
    const r = can(this.actor(s), action, this.policy(), target);
    if (!r.ok) {
      this.fail(
        client,
        action,
        r.code === "muted" ? "muted" : r.code === "gifts_disabled" ? "gifts_disabled" : "forbidden",
      );
      return false;
    }
    return true;
  }

  private limited(client: Client, s: Session, name: keyof PartyRoom["limiters"], action: string) {
    if (this.limiters[name].consume(s.participantId, Date.now()).allowed) return false;
    this.fail(client, action, "rate_limited");
    return true;
  }

  private registerMessages() {
    this.on("ping", (client, _s, msg) => client.send("pong", { t: msg.t, serverTime: Date.now() }));

    this.on("move", (client, s, msg) => {
      if (this.limiters.move.consume(s.participantId, Date.now()).allowed === false) return;
      const p = this.state.players.get(s.participantId);
      if (!p) return;
      const now = Date.now();
      const r = validateMove(s.lastMove, { x: msg.x, z: msg.z }, now, BIRTHDAY_ROOM);
      s.lastMove = { x: r.x, z: r.z, t: now };
      p.x = r.x;
      p.z = r.z;
      p.rotY = normalizeAngle(msg.rotY);
      p.moving = msg.moving;
      if (msg.moving) s.lastActivity = now;
      if (r.corrected) client.send("correct", { x: r.x, z: r.z, seq: msg.seq, reason: r.reason });
    });

    this.on("emote", (client, s, msg) => {
      if (!this.allow(client, s, "emote.send")) return;
      if (this.limited(client, s, "emote", "emote")) return;
      const p = this.state.players.get(s.participantId);
      if (!p) return;
      p.emote = msg.emote;
      p.emoteSeq += 1;
      this.emoteUntil.set(s.participantId, Date.now() + EMOTES[msg.emote as EmoteId].durationMs);
    });

    this.on("ceremonyStart", (client, s) => this.ceremonyAction(client, s, "start"));
    this.on("ceremonyRestart", (client, s) => this.ceremonyAction(client, s, "restart"));
    this.on("blowCandles", (client, s) => this.ceremonyAction(client, s, "blow"));

    this.on("wish", async (client, s, msg) => {
      if (!this.allow(client, s, "wish.send")) return;
      if (this.limited(client, s, "wish", "wish")) return;
      const autoApprove = s.role === "host" || s.role === "cohost";
      const [row] = await db()`
        insert into wishes (room_id, author_participant_id, author_display_name, body, status, moderated_by_participant_id, moderated_at)
        values (${this.dbRoomId}, ${s.participantId}, ${s.name}, ${msg.body},
                ${autoApprove ? "approved" : "pending"}, ${autoApprove ? s.participantId : null}, ${autoApprove ? new Date() : null})
        returning id, created_at`;
      const wish = {
        id: row!.id as string,
        author: s.name,
        body: msg.body,
        createdAt: (row!.created_at as Date).getTime(),
      };
      client.send("wishReceived", { id: wish.id, status: autoApprove ? "approved" : "pending" });
      if (autoApprove) this.pushWish(wish);
      else this.notifyModerators("wishPending", wish);
      void recordAnalytics("wish_sent", this.dbRoomId, { roomId: this.dbRoomId });
    });

    this.on("moderateWish", async (client, s, msg) => {
      if (!this.allow(client, s, "wish.moderate")) return;
      const rows = await db()`
        update wishes set status = ${msg.approve ? "approved" : "rejected"},
               moderated_by_participant_id = ${s.participantId}, moderated_at = now()
         where id = ${msg.wishId} and room_id = ${this.dbRoomId} and status = 'pending'
         returning id, author_display_name, body, created_at`;
      const w = rows[0];
      if (!w) return this.fail(client, "moderateWish", "invalid_transition");
      if (msg.approve) {
        this.pushWish({
          id: w.id,
          author: w.author_display_name,
          body: w.body,
          createdAt: w.created_at.getTime(),
        });
      }
      this.notifyModerators("wishModerated", { id: w.id, approved: msg.approve });
    });

    this.on("gift", async (client, s, msg) => {
      if (!this.allow(client, s, "gift.send")) return;
      if (this.limited(client, s, "gift", "gift")) return;
      const rows = await db()`
        insert into room_gifts (room_id, catalog_id, sender_participant_id, sender_display_name, message, idempotency_key)
        values (${this.dbRoomId}, ${msg.catalogId}, ${s.participantId}, ${s.name}, ${msg.message ?? null}, ${msg.idempotencyKey})
        on conflict (room_id, sender_participant_id, idempotency_key) do nothing
        returning id, created_at`;
      const row = rows[0];
      if (!row) return this.fail(client, "gift", "duplicate");
      this.state.gifts.push(
        new Gift({
          id: row.id,
          catalogId: msg.catalogId,
          sender: s.name,
          senderId: s.participantId,
          message: msg.message ?? "",
          opened: false,
          createdAt: row.created_at.getTime(),
        }),
      );
      while (this.state.gifts.length > MAX_GIFTS_IN_STATE) this.state.gifts.shift();
      client.send("giftReceived", { id: row.id, idempotencyKey: msg.idempotencyKey });
      void recordAnalytics("gift_sent", this.dbRoomId, { roomId: this.dbRoomId, catalogId: msg.catalogId });
    });

    this.on("openGift", async (client, s, msg) => {
      if (!this.allow(client, s, "gift.open")) return;
      const rows = await db()`
        update room_gifts set status = 'opened', opened_at = now(), opened_by_participant_id = ${s.participantId}
         where id = ${msg.giftId} and room_id = ${this.dbRoomId} and status = 'sent' returning id`;
      if (!rows[0]) return this.fail(client, "openGift", "invalid_transition");
      const g = this.state.gifts.find((x) => x.id === msg.giftId);
      if (g) g.opened = true;
    });

    this.on("removeGift", async (client, s, msg) => {
      if (!this.allow(client, s, "moderation.removeMessage")) return;
      await db()`update room_gifts set status = 'removed' where id = ${msg.giftId} and room_id = ${this.dbRoomId}`;
      const i = this.state.gifts.findIndex((x) => x.id === msg.giftId);
      if (i >= 0) this.state.gifts.splice(i, 1);
    });

    this.on("snapshot", (client, s) => {
      if (this.limited(client, s, "action", "snapshot")) return;
      this.broadcast("snapshotTaken", { name: s.name }, { except: client });
      void recordAnalytics("snapshot_created", this.dbRoomId, { roomId: this.dbRoomId });
    });

    this.on("hostKick", async (client, s, msg) => {
      const target = this.state.players.get(msg.participantId);
      const targetRole = (target?.role ?? "guest") as ParticipantRole;
      if (
        !this.allow(client, s, msg.ban ? "moderation.ban" : "moderation.kick", {
          participantId: msg.participantId,
          role: targetRole,
        })
      )
        return;
      const [p] = await db()`
        update room_participants set removed_at = now(), removed_by_participant_id = ${s.participantId}
         where id = ${msg.participantId} and room_id = ${this.dbRoomId} and role <> 'host'
         returning guest_session_id, user_id`;
      if (!p) return this.fail(client, "hostKick", "forbidden");
      if (msg.ban) {
        await db()`insert into room_bans (room_id, guest_session_id, user_id, participant_id, banned_by_participant_id)
                   values (${this.dbRoomId}, ${p.guest_session_id}, ${p.user_id}, ${msg.participantId}, ${s.participantId})
                   on conflict do nothing`;
      }
      for (const [sid, sess] of this.sessions) {
        if (sess.participantId !== msg.participantId) continue;
        this.sessions.delete(sid);
        this.clients.find((c) => c.sessionId === sid)?.leave(CLOSE.kicked);
      }
      this.state.players.delete(msg.participantId);
    });

    this.on("hostMute", async (client, s, msg) => {
      const target = this.state.players.get(msg.participantId);
      if (!target) return this.fail(client, "hostMute", "invalid_payload");
      if (
        !this.allow(client, s, "moderation.mute", {
          participantId: msg.participantId,
          role: target.role as ParticipantRole,
        })
      )
        return;
      await db()`update room_participants set muted = ${msg.muted} where id = ${msg.participantId} and room_id = ${this.dbRoomId}`;
      target.muted = msg.muted;
    });

    this.on("hostLock", async (client, s, msg) => {
      if (!this.allow(client, s, "room.lock")) return;
      await db()`update rooms set locked = ${msg.locked} where id = ${this.dbRoomId}`;
      this.state.locked = msg.locked;
    });

    this.on("hostGifts", async (client, s, msg) => {
      if (!this.allow(client, s, "room.toggleGifts")) return;
      await db()`update rooms set gifts_enabled = ${msg.enabled} where id = ${this.dbRoomId}`;
      this.state.giftsEnabled = msg.enabled;
    });

    this.on("hostDiscovery", async (client, s, msg) => {
      if (!this.allow(client, s, "room.discovery")) return;
      if (msg.discoverable && (!msg.publicName || !msg.publicCountry)) {
        return this.fail(client, "hostDiscovery", "invalid_payload");
      }
      const [row] = await db()`
        update rooms set
          discoverable = ${msg.discoverable},
          public_name = ${msg.discoverable ? msg.publicName! : null},
          public_country = ${msg.discoverable ? msg.publicCountry! : null},
          public_intro = ${msg.discoverable ? (msg.publicIntro ?? null) : null},
          accept_wishes = ${msg.acceptWishes},
          show_participant_count = ${msg.showParticipantCount}
         where id = ${this.dbRoomId}
         returning discoverable, public_name, public_country, public_intro, accept_wishes, show_participant_count`;
      if (!row) return;
      this.state.discoverable = row.discoverable;
      this.state.publicName = row.public_name ?? "";
      this.state.publicCountry = row.public_country ?? "";
      this.state.publicIntro = row.public_intro ?? "";
      this.state.acceptWishes = row.accept_wishes;
      this.state.showParticipantCount = row.show_participant_count;
      client.send("hostDiscoverySaved", { discoverable: row.discoverable });
      void recordAnalytics(row.discoverable ? "explore_opt_in" : "explore_opt_out", this.dbRoomId, {
        roomId: this.dbRoomId,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Ceremony
  // ---------------------------------------------------------------------------
  private ceremonyAction(client: Client, s: Session, kind: "start" | "restart" | "blow") {
    if (kind !== "blow" && this.limited(client, s, "action", "ceremony")) return;
    const now = Date.now();
    const actor = { participantId: s.participantId, role: s.role };
    const r =
      kind === "start"
        ? startCeremony(this.ceremony, actor, now)
        : kind === "restart"
          ? restartCeremony(this.ceremony, actor, now)
          : blowCandles(this.ceremony, actor, now);
    if (!r.ok) {
      this.ceremony = r.state; // timers may have advanced
      this.syncCeremony();
      return this.fail(
        client,
        kind === "blow" ? "blowCandles" : "ceremony",
        r.code === "forbidden" ? "forbidden" : "invalid_transition",
      );
    }
    const previous = this.ceremony;
    this.ceremony = r.state;
    this.syncCeremony();
    void this.persistCeremony(previous, r.state, s.participantId);
  }

  private tick() {
    const now = Date.now();
    const r = tickCeremony(this.ceremony, now);
    if (r.changed) {
      const previous = this.ceremony;
      this.ceremony = r.state;
      this.syncCeremony();
      void this.persistCeremony(previous, r.state, null);
    }
    for (const [pid, until] of this.emoteUntil) {
      if (now < until) continue;
      this.emoteUntil.delete(pid);
      const p = this.state.players.get(pid);
      if (p) p.emote = "";
    }
    for (const [sid, s] of this.sessions) {
      if (now - s.lastActivity > IDLE_TIMEOUT_MS) {
        this.clients.find((c) => c.sessionId === sid)?.leave(CLOSE.idle);
      }
    }
  }

  private syncCeremony() {
    const c = this.state.ceremony;
    c.phase = this.ceremony.phase;
    c.run = this.ceremony.run;
    c.phaseStartedAt = this.ceremony.phaseStartedAt;
    c.phaseEndsAt = this.ceremony.phaseEndsAt ?? 0;
    c.countdownEndsAt = this.ceremony.countdownEndsAt ?? 0;
    c.blownBy = this.ceremony.blownBy ?? "";
    c.autoBlown = this.ceremony.autoBlown;
  }

  private async persistCeremony(prev: CeremonyState, next: CeremonyState, actor: string | null) {
    try {
      const participants = [...this.state.players.values()].filter((p) => p.connected).length;
      if (next.run !== prev.run) {
        const [row] = await db()`
          insert into ceremonies (room_id, run, started_by_participant_id, started_at, final_phase, participant_count)
          values (${this.dbRoomId}, ${next.run}, ${next.startedBy}, ${new Date(next.phaseStartedAt)}, 'PREPARING', ${participants})
          returning id`;
        this.ceremonyRowId = row!.id;
        void recordAnalytics("ceremony_started", this.dbRoomId, { roomId: this.dbRoomId, participants });
      }
      if (!this.ceremonyRowId) return;
      await db()`insert into ceremony_events (ceremony_id, phase, server_ts, actor_participant_id)
                 values (${this.ceremonyRowId}, ${next.phase}, ${new Date(next.phaseStartedAt)}, ${actor})`;
      await db()`update ceremonies set final_phase = ${next.phase}, auto_blown = ${next.autoBlown},
                   completed_at = ${next.phase === "COMPLETE" ? new Date(next.phaseStartedAt) : null}
                 where id = ${this.ceremonyRowId}`;
      if (next.phase === "COMPLETE") {
        void recordAnalytics("ceremony_completed", this.dbRoomId, { roomId: this.dbRoomId, participants });
      }
    } catch (err) {
      log.error("ceremony persistence failed", { err });
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private pushWish(w: { id: string; author: string; body: string; createdAt: number }) {
    this.state.wishes.push(new Wish(w));
    while (this.state.wishes.length > MAX_WISHES_IN_STATE) this.state.wishes.shift();
  }

  private notifyModerators(type: string, payload: unknown) {
    for (const [sid, s] of this.sessions) {
      if (s.role !== "host" && s.role !== "cohost") continue;
      this.clients.find((c) => c.sessionId === sid)?.send(type, payload);
    }
  }

  private async sendPendingWishes(client: Client) {
    const rows = await db()`
      select id, author_display_name, body, created_at from wishes
       where room_id = ${this.dbRoomId} and status = 'pending' and deleted_at is null
       order by created_at asc limit 100`;
    client.send(
      "wishesPending",
      rows.map((w) => ({
        id: w.id,
        author: w.author_display_name,
        body: w.body,
        createdAt: w.created_at.getTime(),
      })),
    );
  }

  /** Picks up wishes sent from the Explore dashboard (apps/web) while this room is already live. */
  private async pollPublicWishes() {
    if (!this.state.discoverable) return;
    try {
      const rows = await db()`
        select id, author_display_name, body, created_at from wishes
         where room_id = ${this.dbRoomId} and status = 'pending' and source = 'public'
           and deleted_at is null and created_at > ${this.lastPublicWishCheck}
         order by created_at asc limit 50`;
      for (const w of rows) {
        this.notifyModerators("wishPending", {
          id: w.id,
          author: w.author_display_name,
          body: w.body,
          createdAt: w.created_at.getTime(),
        });
        if (w.created_at > this.lastPublicWishCheck) this.lastPublicWishCheck = w.created_at;
      }
    } catch (err) {
      log.error("public wish poll failed", { err });
    }
  }

  private async touchParticipant(participantId: string) {
    try {
      await db()`update room_participants set last_seen_at = now() where id = ${participantId}`;
    } catch {
      /* non-critical */
    }
  }
}
