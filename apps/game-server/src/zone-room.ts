import { randomUUID } from "node:crypto";
import { Room, ServerError, type AuthContext, type Client } from "@colyseus/core";
import { schema, t, type SchemaType } from "@colyseus/schema";
import { TokenBucketLimiter } from "@happyroom/game-core";
import { graphemeLength, sanitizeSingleLine } from "@happyroom/shared";
import { verifyWorldGrant, type WorldGrantPayload } from "@happyroom/shared/grant";
import type { WORLD_EMOTES } from "@happyroom/world";
import {
  buildZoneCollision,
  normalizeAngle,
  parseZoneDefinition,
  safeSpawn,
  screenChat,
  validateZoneMove,
  WORLD_PROTOCOL_VERSION,
  worldClientMessages,
  worldJoinOptionsSchema,
  type WorldClientMessageType,
  type ZoneCollision,
  type ZoneDefinition,
} from "@happyroom/world";
import { db } from "./db.js";
import { log } from "./logger.js";

/** Public zone state: only presence data every visitor may see. */
export const ZonePlayer = schema(
  {
    id: t.string(), // player_profiles.id
    name: t.string(),
    avatar: t.string(),
    x: t.number(),
    z: t.number(),
    rotY: t.number(),
    anim: t.string(), // idle | walk | run
    emote: t.string(),
    emoteSeq: t.number(),
    connected: t.boolean(),
  },
  "ZonePlayer",
);
export type ZonePlayer = SchemaType<typeof ZonePlayer>;

export const ZoneState = schema(
  {
    zoneId: t.string(),
    zoneVersion: t.string(),
    maxPlayers: t.number(),
    players: t.map(ZonePlayer),
  },
  "ZoneState",
);
export type ZoneState = SchemaType<typeof ZoneState>;

const EMOTE_MS = 2500;
const RECONNECT_SECONDS = 20;
const CHAT_MAX_GRAPHEMES = 200;

interface ZoneSession {
  profileId: string;
  name: string;
  ageBand: WorldGrantPayload["ageBand"];
  chatEnabled: boolean;
  last: { x: number; z: number; t: number };
  blocks: Set<string>; // profiles this player blocked OR who blocked this player
  leavingVia: { portalId: string; returnSpawnId: string } | null;
}

let grantKey = "";
export function configureZoneRoom(opts: { grantKey: string }) {
  grantKey = opts.grantKey;
}

export class ZoneRoom extends Room<{ state: ZoneState }> {
  private zone!: ZoneDefinition;
  private zoneDbId = "";
  private collision!: ZoneCollision;
  private sessions = new Map<string, ZoneSession>();
  private emoteUntil = new Map<string, number>();
  private limiters = {
    move: new TokenBucketLimiter({ points: 40, windowSeconds: 1 }),
    emote: new TokenBucketLimiter({ points: 10, windowSeconds: 5 }),
    chat: new TokenBucketLimiter({ points: 5, windowSeconds: 10 }),
    portal: new TokenBucketLimiter({ points: 6, windowSeconds: 10 }),
  };

  override async onCreate(options: { zoneId?: string }) {
    const zoneKey = typeof options?.zoneId === "string" ? options.zoneId : "";
    const rows = await db()`
      select z.id, z.definition from world_zones z
       where z.zone_key = ${zoneKey} and z.published_status = 'published'`;
    if (!rows[0]) throw new ServerError(404, "zone_not_found");
    this.zone = parseZoneDefinition(rows[0].definition);
    this.zoneDbId = rows[0].id;
    this.collision = buildZoneCollision(this.zone);
    // Each instance holds up to maxPlayers; Colyseus locks a full instance and the matchmaker
    // creates another one (sharding) — the world never puts every user into one scene.
    this.maxClients = this.zone.maxPlayers;
    this.setPatchRate(50);
    const state = new ZoneState();
    state.zoneId = this.zone.zoneId;
    state.zoneVersion = this.zone.version;
    state.maxPlayers = this.zone.maxPlayers;
    this.setState(state);
    this.registerMessages();
    this.clock.setInterval(() => this.tick(), 200);
    log.info("zone instance created", { zone: this.zone.zoneId, instance: this.roomId });
  }

  override async onAuth(_client: Client, options: unknown, _ctx: AuthContext): Promise<WorldGrantPayload> {
    const opts = worldJoinOptionsSchema.safeParse(options);
    if (!opts.success) throw new ServerError(400, "invalid_payload");
    if (opts.data.protocolVersion !== WORLD_PROTOCOL_VERSION) throw new ServerError(426, "client_outdated");
    const v = verifyWorldGrant(opts.data.grant, grantKey);
    if (!v.ok) throw new ServerError(401, "unauthorized");
    if (v.payload.zoneId !== this.zone.zoneId || opts.data.zoneId !== this.zone.zoneId)
      throw new ServerError(403, "forbidden");
    const [p] = await db()`select banned_at from player_profiles where id = ${v.payload.profileId}`;
    if (!p) throw new ServerError(403, "forbidden");
    if (p.banned_at) throw new ServerError(403, "banned");
    return v.payload;
  }

  override async onJoin(client: Client, _o: unknown, grant: WorldGrantPayload) {
    // One connection per profile per instance: a new tab replaces the old one.
    for (const [sid, s] of this.sessions) {
      if (s.profileId === grant.profileId && sid !== client.sessionId) {
        this.sessions.delete(sid);
        this.clients.find((c) => c.sessionId === sid)?.leave(4001);
      }
    }
    const spawn = await this.chooseSpawn(grant);
    let player = this.state.players.get(grant.profileId);
    if (!player) {
      player = new ZonePlayer({
        id: grant.profileId,
        name: grant.displayName,
        avatar: grant.avatar,
        x: spawn.x,
        z: spawn.z,
        rotY: spawn.rotY,
        anim: "idle",
        emote: "",
        emoteSeq: 0,
        connected: true,
      });
      this.state.players.set(grant.profileId, player);
    } else {
      // A previous connection of this profile was dropped (e.g. page reload) and its seat is still
      // held. This is a fresh join, so it gets the freshly chosen spawn, not the stale position.
      player.x = spawn.x;
      player.z = spawn.z;
      player.rotY = spawn.rotY;
      player.anim = "idle";
    }
    player.connected = true;
    const blocks = await db()`
      select blocked_id as other from player_blocks where blocker_id = ${grant.profileId}
      union select blocker_id from player_blocks where blocked_id = ${grant.profileId}`;
    this.sessions.set(client.sessionId, {
      profileId: grant.profileId,
      name: grant.displayName,
      ageBand: grant.ageBand,
      chatEnabled: grant.chatEnabled && grant.ageBand !== "under13" && this.zone.permissions.chat !== "off",
      last: { x: player.x, z: player.z, t: Date.now() },
      blocks: new Set(blocks.map((b) => b.other as string)),
      leavingVia: null,
    });
    client.send("welcome", {
      profileId: grant.profileId,
      serverTime: Date.now(),
      instanceId: this.roomId,
      spawn: { x: player.x, z: player.z, rotY: player.rotY },
    });
    // Record the current zone immediately, so a reload resumes here even before this session ends.
    try {
      await db()`
        insert into player_locations (profile_id, zone_id, x, z, rot_y, updated_at)
        values (${grant.profileId}, ${this.zoneDbId}, ${player.x}, ${player.z}, ${player.rotY}, now())
        on conflict (profile_id) do update set zone_id = excluded.zone_id, x = excluded.x, z = excluded.z,
          rot_y = excluded.rot_y, last_portal_key = null, updated_at = now()`;
    } catch (err) {
      log.error("recording zone entry failed", { err });
    }
    void this.event("zone_enter", grant.profileId, { instance: this.roomId });
  }

  override async onDrop(client: Client) {
    const s = this.sessions.get(client.sessionId);
    const p = s && this.state.players.get(s.profileId);
    if (p) {
      p.connected = false;
      p.anim = "idle";
    }
    try {
      await this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      /* window expired → onLeave */
    }
  }

  override onReconnect(client: Client) {
    const s = this.sessions.get(client.sessionId);
    const p = s && this.state.players.get(s.profileId);
    if (p) p.connected = true;
    if (s) s.last.t = Date.now();
  }

  override async onLeave(client: Client) {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    this.sessions.delete(client.sessionId);
    const p = this.state.players.get(s.profileId);
    if (![...this.sessions.values()].some((x) => x.profileId === s.profileId))
      this.state.players.delete(s.profileId);
    if (p) await this.saveLocation(s, p);
    void this.event("zone_leave", s.profileId, { via: s.leavingVia?.portalId ?? null });
  }

  // ---------------------------------------------------------------------------
  private async chooseSpawn(grant: WorldGrantPayload): Promise<{ x: number; z: number; rotY: number }> {
    const def = this.zone.spawnPoints.find((s) => s.default)!;
    let preferred = grant.spawnId ? this.zone.spawnPoints.find((s) => s.id === grant.spawnId) : undefined;
    let chosen: { x: number; z: number; rotY: number } = preferred ?? def;
    if (!preferred) {
      const [loc] =
        await db()`select x, z, rot_y from player_locations where profile_id = ${grant.profileId} and zone_id = ${this.zoneDbId}`;
      if (loc) chosen = { x: loc.x, z: loc.z, rotY: loc.rot_y };
    }
    preferred = undefined;
    // Never spawn inside geometry, and spread players who arrive at the same point.
    let pos = safeSpawn({ x: chosen.x, z: chosen.z }, this.collision, def);
    const others = [...this.state.players.values()].filter((o) => o.id !== grant.profileId && o.connected);
    for (let i = 0; i < 8 && others.some((o) => Math.hypot(o.x - pos.x, o.z - pos.z) < 0.7); i++) {
      const a = (i / 8) * Math.PI * 2;
      pos = safeSpawn(
        { x: chosen.x + Math.cos(a) * 0.9, z: chosen.z + Math.sin(a) * 0.9 },
        this.collision,
        def,
      );
    }
    return { ...pos, rotY: chosen.rotY };
  }

  private async saveLocation(s: ZoneSession, p: ZonePlayer) {
    try {
      let { x, z, rotY } = p;
      if (s.leavingVia) {
        const back = this.zone.spawnPoints.find((sp) => sp.id === s.leavingVia!.returnSpawnId);
        if (back) ({ x, z, rotY } = back);
      }
      await db()`
        insert into player_locations (profile_id, zone_id, x, z, rot_y, last_portal_key, updated_at)
        values (${s.profileId}, ${this.zoneDbId}, ${x}, ${z}, ${rotY}, ${s.leavingVia?.portalId ?? null}, now())
        on conflict (profile_id) do update set zone_id = excluded.zone_id, x = excluded.x, z = excluded.z,
          rot_y = excluded.rot_y, last_portal_key = excluded.last_portal_key, updated_at = now()
        -- A late "leave" from a zone the player already travelled away from must not overwrite
        -- the location written when they joined their new zone.
        where player_locations.zone_id = excluded.zone_id`;
      await db()`update player_profiles set last_seen_at = now() where id = ${s.profileId}`;
    } catch (err) {
      log.error("saving location failed", { err });
    }
  }

  private async event(type: string, profileId: string | null, payload: Record<string, unknown>) {
    try {
      await db()`insert into world_events (zone_id, profile_id, event_type, payload)
                 values (${this.zoneDbId}, ${profileId}, ${type}, ${db().json(payload as never)})`;
    } catch {
      /* non-critical */
    }
  }

  private on<T extends WorldClientMessageType>(
    type: T,
    handler: (client: Client, s: ZoneSession, msg: never) => unknown,
  ) {
    this.onMessage(type, (client: Client, raw: unknown) => {
      const s = this.sessions.get(client.sessionId);
      if (!s) return;
      const parsed = worldClientMessages[type].safeParse(raw ?? {});
      if (!parsed.success) return client.send("error", { action: type, code: "invalid_payload" });
      try {
        const r = handler(client, s, parsed.data as never);
        if (r instanceof Promise) r.catch((err) => log.error("zone handler failed", { type, err }));
      } catch (err) {
        log.error("zone handler failed", { type, err });
      }
    });
  }

  private limited(client: Client, s: ZoneSession, name: keyof ZoneRoom["limiters"], action: string) {
    if (this.limiters[name].consume(s.profileId, Date.now()).allowed) return false;
    client.send("error", { action, code: "rate_limited" });
    return true;
  }

  private registerMessages() {
    this.on("ping", (client, _s, m: { t: number }) =>
      client.send("pong", { t: m.t, serverTime: Date.now() }),
    );

    this.on("move", (client, s, m: { seq: number; x: number; z: number; rotY: number; anim: string }) => {
      if (!this.limiters.move.consume(s.profileId, Date.now()).allowed) return;
      const p = this.state.players.get(s.profileId);
      if (!p) return;
      const now = Date.now();
      const r = validateZoneMove(s.last, { x: m.x, z: m.z }, now, this.collision);
      s.last = { x: r.x, z: r.z, t: now };
      p.x = r.x;
      p.z = r.z;
      p.rotY = normalizeAngle(m.rotY);
      p.anim = m.anim;
      if (r.corrected) client.send("correct", { x: r.x, z: r.z, seq: m.seq });
    });

    this.on("emote", (client, s, m: { emote: (typeof WORLD_EMOTES)[number] }) => {
      if (this.limited(client, s, "emote", "emote")) return;
      const p = this.state.players.get(s.profileId);
      if (!p) return;
      p.emote = m.emote;
      p.emoteSeq += 1;
      this.emoteUntil.set(s.profileId, Date.now() + EMOTE_MS);
    });

    this.on("chat", (client, s, m: { text: string }) => {
      if (!s.chatEnabled) return client.send("error", { action: "chat", code: "chat_disabled" });
      if (this.limited(client, s, "chat", "chat")) return;
      const text = sanitizeSingleLine(m.text);
      if (!text || graphemeLength(text) > CHAT_MAX_GRAPHEMES)
        return client.send("error", { action: "chat", code: "invalid_payload" });
      const screened = screenChat(text);
      if (!screened.ok) {
        void this.event("chat_blocked", s.profileId, {});
        return client.send("error", { action: "chat", code: "chat_filtered" });
      }
      const msg = { id: randomUUID(), from: s.profileId, name: s.name, text: screened.text, t: Date.now() };
      // Permission-aware delivery: never to people who blocked the sender (or whom the sender
      // blocked), and never to players whose chat is off (e.g. under-13 accounts).
      for (const c of this.clients) {
        const r = this.sessions.get(c.sessionId);
        if (!r || !r.chatEnabled) continue;
        if (r.blocks.has(s.profileId) || s.blocks.has(r.profileId)) continue;
        c.send("chat", msg);
      }
    });

    this.on("usePortal", (client, s, m: { portalId: string }) => {
      if (this.limited(client, s, "portal", "usePortal")) return;
      const portal = this.zone.portals.find((p) => p.id === m.portalId);
      const p = this.state.players.get(s.profileId);
      if (!portal || !p) return client.send("error", { action: "usePortal", code: "invalid_payload" });
      // Proximity is checked against the AUTHORITATIVE position (+1 m tolerance for latency).
      if (Math.hypot(p.x - portal.position[0], p.z - portal.position[1]) > portal.radius + 1) {
        return client.send("error", { action: "usePortal", code: "too_far" });
      }
      s.leavingVia = { portalId: portal.id, returnSpawnId: portal.returnSpawnId };
      void this.event("portal_use", s.profileId, { portal: portal.id, target: portal.target });
      client.send("portal", { portalId: portal.id, target: portal.target });
    });

    // A player updated their block list via the API; reload it for chat filtering.
    this.onMessage("refreshBlocks", async (client: Client) => {
      const s = this.sessions.get(client.sessionId);
      if (!s) return;
      const rows = await db()`
        select blocked_id as other from player_blocks where blocker_id = ${s.profileId}
        union select blocker_id from player_blocks where blocked_id = ${s.profileId}`;
      s.blocks = new Set(rows.map((r) => r.other as string));
      for (const other of this.sessions.values()) {
        if (s.blocks.has(other.profileId)) other.blocks.add(s.profileId);
      }
    });
  }

  private tick() {
    const now = Date.now();
    for (const [id, until] of this.emoteUntil) {
      if (now < until) continue;
      this.emoteUntil.delete(id);
      const p = this.state.players.get(id);
      if (p) p.emote = "";
    }
  }
}
