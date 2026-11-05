/**
 * WorldEventBus — typed pub/sub that decouples engine systems from UI (HUD, analytics, audio…).
 * Systems emit facts; anything may listen without the emitter knowing about it.
 */
export interface WorldEvents {
  "zone:loading": { zoneId: string; progress: number };
  "zone:ready": { zoneId: string };
  "zone:left": { zoneId: string };
  "connection:status": { status: ConnectionStatus };
  "interaction:focus": { id: string | null; promptKey: string | null };
  "portal:granted": { portalId: string; target: PortalTarget };
  "chat:message": ChatMessage;
  notice: { key: string; values?: Record<string, string | number> };
}

export type ConnectionStatus =
  "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
export type PortalTarget = { kind: "zone"; zoneId: string; spawnId: string } | { kind: "birthday_house" };
export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text: string;
  t: number;
}

type Handler<T> = (payload: T) => void;

export class WorldEventBus {
  private handlers = new Map<keyof WorldEvents, Set<Handler<never>>>();

  on<K extends keyof WorldEvents>(event: K, handler: Handler<WorldEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => void set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof WorldEvents>(event: K, payload: WorldEvents[K]): void {
    for (const h of this.handlers.get(event) ?? []) (h as Handler<WorldEvents[K]>)(payload);
  }

  clear() {
    this.handlers.clear();
  }
}
