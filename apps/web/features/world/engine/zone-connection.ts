"use client";

import { Client, type Room } from "@colyseus/sdk";
import {
  WORLD_PROTOCOL_VERSION,
  type WorldClientMessage,
  type WorldClientMessageType,
  type ZoneDefinition,
} from "@happyroom/world";
import type { ChatMessage, ConnectionStatus, PortalTarget, WorldEventBus } from "./event-bus";
import type { ZoneRegistry } from "./zone-registry";

/**
 * ZoneMatchmaker + PlayerPresenceManager.
 *  - enter(): asks the web API for a world grant (profile + zone permissions checked there), then
 *    joins a `zone` room on the game server. Colyseus picks a non-full instance or creates one.
 *  - Presence: `live` is mutated on every patch and read in the render loop; `players` is a small
 *    snapshot (id/name/avatar/connected) for React UI. Only server-confirmed players exist here —
 *    there are no simulated or demo players in the world.
 */
export interface LivePlayer {
  id: string;
  name: string;
  avatar: string;
  x: number;
  z: number;
  rotY: number;
  anim: string;
  emote: string;
  emoteSeq: number;
  connected: boolean;
}

export interface EnterError {
  code: string;
}

export class ZoneConnection {
  status: ConnectionStatus = "idle";
  zone: ZoneDefinition | null = null;
  instanceId = "";
  selfId = "";
  spawn: { x: number; z: number; rotY: number } | null = null;
  readonly live = new Map<string, LivePlayer>();
  players: Pick<LivePlayer, "id" | "name" | "avatar" | "connected" | "emote" | "emoteSeq">[] = [];
  chat: ChatMessage[] = [];
  clockOffset = 0;
  endedCode: number | null = null;
  private room: Room | null = null;
  private listeners = new Set<() => void>();
  private correction = new Set<(c: { x: number; z: number }) => void>();
  private key = "";
  private ping: number | null = null;
  /** Bumped by every enter()/leave(); stale async work from an older generation is discarded. */
  private gen = 0;

  constructor(
    private readonly bus: WorldEventBus,
    private readonly registry: ZoneRegistry,
  ) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = () => `${this.status}|${this.key}|${this.chat.length}|${this.zone?.zoneId ?? ""}`;
  onCorrection(cb: (c: { x: number; z: number }) => void) {
    this.correction.add(cb);
    return () => void this.correction.delete(cb);
  }
  private changed() {
    for (const l of this.listeners) l();
  }
  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.bus.emit("connection:status", { status: s });
    this.changed();
  }

  /**
   * Join a zone. Resolves `true` when connected, `false` when superseded by a newer enter()/leave()
   * (React StrictMode remounts, fast travel); rejects with an EnterError on real failures.
   */
  async enter(zoneId: string, spawnId?: string): Promise<boolean> {
    await this.leave();
    const myGen = ++this.gen;
    const stale = () => myGen !== this.gen;
    this.endedCode = null;
    this.setStatus("connecting");
    this.bus.emit("zone:loading", { zoneId, progress: 0.1 });
    const res = await fetch("/api/world/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ zoneId, ...(spawnId ? { spawnId } : {}) }),
    }).catch(() => null);
    if (stale()) return false;
    if (!res) {
      this.setStatus("error");
      throw { code: "network" } satisfies EnterError;
    }
    const body = await res.json().catch(() => ({}));
    if (stale()) return false;
    if (!res.ok) {
      this.setStatus("error");
      throw { code: typeof body.error === "string" ? body.error : "enter_failed" } satisfies EnterError;
    }
    this.zone = this.registry.remember(body.zone);
    this.bus.emit("zone:loading", { zoneId, progress: 0.4 });
    let room: Room;
    try {
      room = await new Client(body.gameServerUrl as string).joinOrCreate("zone", {
        zoneId,
        protocolVersion: WORLD_PROTOCOL_VERSION,
        grant: body.grant,
      });
    } catch {
      if (stale()) return false;
      this.setStatus("error");
      throw { code: "connect_failed" } satisfies EnterError;
    }
    if (stale()) {
      void room.leave(true);
      return false;
    }
    type Welcome = { profileId: string; serverTime: number; instanceId: string; spawn: { x: number; z: number; rotY: number } };
    // Register the welcome handler before anything else so the first server message is never missed.
    const welcome = new Promise<Welcome | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 8000);
      const off = room.onMessage("welcome", (m: Welcome) => {
        window.clearTimeout(timer);
        off();
        resolve(m);
      });
    });
    this.attach(room);
    const m = await welcome;
    if (stale()) return false;
    if (!m) {
      void room.leave(true);
      this.room = null;
      this.setStatus("error");
      throw { code: "connect_failed" } satisfies EnterError;
    }
    this.selfId = m.profileId;
    this.instanceId = m.instanceId;
    this.spawn = m.spawn;
    this.clockOffset = m.serverTime - Date.now();
    this.bus.emit("zone:loading", { zoneId, progress: 0.7 });
    this.setStatus("connected");
    return true;
  }

  private attach(room: Room) {
    this.room = room;
    this.chat = [];
    room.onStateChange((state) => this.ingest(state));
    room.onMessage("correct", (c: { x: number; z: number }) => this.correction.forEach((l) => l(c)));
    room.onMessage("chat", (m: ChatMessage) => {
      this.chat = [...this.chat.slice(-49), m];
      this.bus.emit("chat:message", m);
      this.changed();
    });
    room.onMessage("portal", (m: { portalId: string; target: PortalTarget }) =>
      this.bus.emit("portal:granted", m),
    );
    room.onMessage("error", (m: { code: string }) =>
      this.bus.emit("notice", { key: `world.errors.${m.code}` }),
    );
    room.onMessage("pong", (m: { t: number; serverTime: number }) => {
      this.clockOffset = m.serverTime + (performance.now() - m.t) / 2 - Date.now();
    });
    room.onDrop(() => this.setStatus("reconnecting"));
    room.onReconnect(() => this.setStatus("connected"));
    room.onLeave((code) => {
      if (this.room !== room) return; // abandoned connection
      this.endedCode = code;
      this.setStatus("disconnected");
    });
    this.ping = window.setInterval(() => this.send("ping", { t: performance.now() }), 5000);
  }

  private ingest(state: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (state as any).toJSON() as { players: Record<string, LivePlayer> };
    const list = Object.values(s.players ?? {});
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      const e = this.live.get(p.id);
      if (e) Object.assign(e, p);
      else this.live.set(p.id, { ...p });
    }
    for (const id of [...this.live.keys()]) if (!seen.has(id)) this.live.delete(id);
    const key = JSON.stringify(list.map((p) => [p.id, p.name, p.avatar, p.connected, p.emote, p.emoteSeq]));
    if (key === this.key) return;
    this.key = key;
    this.players = list.map(({ id, name, avatar, connected, emote, emoteSeq }) => ({
      id,
      name,
      avatar,
      connected,
      emote,
      emoteSeq,
    }));
    this.changed();
  }

  send<T extends WorldClientMessageType>(type: T, payload: WorldClientMessage<T>): boolean {
    if (!this.room || this.status !== "connected") return false;
    this.room.send(type, payload);
    return true;
  }

  /** Tell the server our block list changed so chat filtering updates immediately. */
  refreshBlocks() {
    if (this.room && this.status === "connected") this.room.send("refreshBlocks", {});
  }

  async leave() {
    this.gen++;
    if (this.ping) window.clearInterval(this.ping);
    this.ping = null;
    const room = this.room;
    this.room = null;
    if (this.zone) this.bus.emit("zone:left", { zoneId: this.zone.zoneId });
    this.live.clear();
    this.players = [];
    this.key = "";
    if (room) await Promise.race([room.leave(true).catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  }
}
