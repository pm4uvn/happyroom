"use client";

import { Client, type Room } from "@colyseus/sdk";
import { PROTOCOL_VERSION, type ClientMessage, type ClientMessageType } from "@happyroom/shared";

/**
 * Browser side of the authoritative party room.
 *
 * Two views of the same server state:
 *  - `live`: mutable per-player records updated on every patch (20 Hz) and read inside the render
 *    loop (useFrame) — no React re-render per patch.
 *  - `view`: an immutable snapshot for React UI, replaced only when something UI-relevant changes.
 * Nothing here is simulated locally except the local player's own predicted position.
 */

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  role: string;
  x: number;
  z: number;
  rotY: number;
  moving: boolean;
  emote: string;
  emoteSeq: number;
  connected: boolean;
  muted: boolean;
}

export interface WishView {
  id: string;
  author: string;
  body: string;
  createdAt: number;
}

export interface GiftView {
  id: string;
  catalogId: string;
  sender: string;
  senderId: string;
  message: string;
  opened: boolean;
  createdAt: number;
}

export interface CeremonyView {
  phase: string;
  run: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  countdownEndsAt: number;
  blownBy: string;
  autoBlown: boolean;
}

export interface PartyView {
  title: string;
  honoree: string;
  themeId: string;
  cakeStyle: string;
  decoration: string;
  hostId: string;
  locked: boolean;
  giftsEnabled: boolean;
  capacity: number;
  players: PlayerView[];
  wishes: WishView[];
  gifts: GiftView[];
  ceremony: CeremonyView;
}

export type PartyNotice =
  | { kind: "error"; action: string; code: string }
  | { kind: "wishReceived"; status: "pending" | "approved" }
  | { kind: "giftReceived" }
  | { kind: "snapshotTaken"; name: string };

export interface JoinTicket {
  partyId: string;
  participantId: string;
  role: string;
  grant: string;
  gameServerUrl: string;
}

type Listener = () => void;

export class PartyConnection {
  status: ConnectionStatus = "connecting";
  /** Close code that ended the session (4001 replaced, 4003 kicked, 4004 idle), if any. */
  endedCode: number | null = null;
  view: PartyView | null = null;
  readonly live = new Map<string, PlayerView>();
  pendingWishes: WishView[] = [];
  readonly selfId: string;
  readonly role: string;
  /** serverTime ≈ Date.now() + clockOffset */
  clockOffset = 0;
  private bestRtt = Infinity;
  private room: Room | null = null;
  private listeners = new Set<Listener>();
  private noticeListeners = new Set<(n: PartyNotice) => void>();
  private correctionListeners = new Set<(c: { x: number; z: number }) => void>();
  private uiKey = "";
  private pingTimer: number | null = null;
  /**
   * Connection generation. Every connect()/leave() bumps it, and a join that resolves after a newer
   * generation started is discarded. This makes the class safe under React StrictMode (dev mounts
   * effects twice: connect → leave → connect) and against quick navigation.
   */
  private gen = 0;

  constructor(private readonly ticket: JoinTicket) {
    this.selfId = ticket.participantId;
    this.role = ticket.role;
  }

  // -- subscription (useSyncExternalStore) -----------------------------------
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = () => `${this.status}|${this.uiKey}|${this.pendingWishes.length}|${this.endedCode ?? ""}`;
  onNotice(cb: (n: PartyNotice) => void) {
    this.noticeListeners.add(cb);
    return () => void this.noticeListeners.delete(cb);
  }
  onCorrection(cb: (c: { x: number; z: number }) => void) {
    this.correctionListeners.add(cb);
    return () => void this.correctionListeners.delete(cb);
  }
  private emit() {
    for (const l of this.listeners) l();
  }
  private notice(n: PartyNotice) {
    for (const l of this.noticeListeners) l(n);
  }
  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.emit();
  }

  serverNow() {
    return Date.now() + this.clockOffset;
  }

  // -- lifecycle ---------------------------------------------------------------
  async connect(): Promise<void> {
    const myGen = ++this.gen;
    this.endedCode = null;
    this.setStatus("connecting");
    const client = new Client(this.ticket.gameServerUrl);
    let room: Room;
    try {
      room = await client.joinOrCreate("party", {
        partyId: this.ticket.partyId,
        protocolVersion: PROTOCOL_VERSION,
        grant: this.ticket.grant,
      });
    } catch {
      if (myGen === this.gen) this.setStatus("error");
      throw new Error("connect_failed");
    }
    if (myGen !== this.gen) {
      // Superseded (e.g. StrictMode remount or the user left meanwhile): drop this room.
      void room.leave(true);
      return;
    }
    this.attach(room);
    this.setStatus("connected");
    this.send("ping", { t: performance.now() });
  }

  private attach(room: Room) {
    this.room = room;
    room.onStateChange((state) => this.ingest(state));
    room.onMessage("welcome", (m: { serverTime: number }) => this.sampleClock(m.serverTime, 0));
    room.onMessage("pong", (m: { t: number; serverTime: number }) => {
      const rtt = performance.now() - m.t;
      this.sampleClock(m.serverTime, rtt);
    });
    room.onMessage("correct", (m: { x: number; z: number }) => {
      for (const l of this.correctionListeners) l(m);
    });
    room.onMessage("error", (m: { action: string; code: string }) => this.notice({ kind: "error", ...m }));
    room.onMessage("wishReceived", (m: { status: "pending" | "approved" }) =>
      this.notice({ kind: "wishReceived", status: m.status }),
    );
    room.onMessage("giftReceived", () => this.notice({ kind: "giftReceived" }));
    room.onMessage("snapshotTaken", (m: { name: string }) =>
      this.notice({ kind: "snapshotTaken", name: m.name }),
    );
    room.onMessage("wishesPending", (list: WishView[]) => {
      this.pendingWishes = list;
      this.emit();
    });
    room.onMessage("wishPending", (w: WishView) => {
      this.pendingWishes = [...this.pendingWishes.filter((x) => x.id !== w.id), w];
      this.emit();
    });
    room.onMessage("wishModerated", (m: { id: string }) => {
      this.pendingWishes = this.pendingWishes.filter((x) => x.id !== m.id);
      this.emit();
    });
    room.onDrop(() => this.setStatus("reconnecting"));
    room.onReconnect(() => this.setStatus("connected"));
    room.onLeave((code) => {
      if (this.room !== room) return; // an old/abandoned connection
      this.endedCode = code;
      this.setStatus("disconnected");
    });

    this.pingTimer = window.setInterval(() => this.send("ping", { t: performance.now() }), 4000);
  }

  private sampleClock(serverTime: number, rtt: number) {
    // Prefer the lowest-latency sample: its one-way delay estimate (rtt/2) is the most accurate.
    if (rtt > 0 && rtt > this.bestRtt * 1.5) return;
    if (rtt > 0) this.bestRtt = Math.min(this.bestRtt, rtt);
    this.clockOffset = serverTime + rtt / 2 - Date.now();
  }

  private ingest(state: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (state as any).toJSON() as Omit<PartyView, "players"> & { players: Record<string, PlayerView> };
    const players = Object.values(s.players ?? {});
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      const existing = this.live.get(p.id);
      if (existing) Object.assign(existing, p);
      else this.live.set(p.id, { ...p });
    }
    for (const id of [...this.live.keys()]) if (!seen.has(id)) this.live.delete(id);

    // Re-render React only for UI-relevant changes (positions rounded to 0.5 m for the people list).
    const key = JSON.stringify([
      s.title,
      s.honoree,
      s.themeId,
      s.cakeStyle,
      s.decoration,
      s.hostId,
      s.locked,
      s.giftsEnabled,
      s.capacity,
      players.map((p) => [
        p.id,
        p.name,
        p.avatar,
        p.role,
        p.emote,
        p.emoteSeq,
        p.connected,
        p.muted,
        p.moving,
        Math.round(p.x * 2),
        Math.round(p.z * 2),
      ]),
      (s.wishes ?? []).map((w) => w.id),
      (s.gifts ?? []).map((g) => [g.id, g.opened]),
      s.ceremony,
    ]);
    if (key === this.uiKey) return;
    this.uiKey = key;
    this.view = { ...s, players, wishes: s.wishes ?? [], gifts: s.gifts ?? [] } as PartyView;
    this.emit();
  }

  send<T extends ClientMessageType>(type: T, payload: ClientMessage<T>) {
    if (!this.room || this.status !== "connected") return false;
    this.room.send(type, payload);
    return true;
  }

  async leave() {
    const room = this.dispose();
    await room?.leave(true).catch(() => {});
  }

  /** Abandon the current connection (listeners are owned and removed by their subscribers). */
  dispose(): Room | null {
    this.gen++;
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
    const room = this.room;
    this.room = null;
    return room;
  }
}
