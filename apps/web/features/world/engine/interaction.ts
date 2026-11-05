import type { Portal, ZoneDefinition } from "@happyroom/world";

/**
 * WorldInteractionSystem + PortalSystem — pure proximity logic over zone data. The nearest
 * interactable (object interaction or portal) within range is "focused"; pressing E / the action
 * button triggers it. Portals are re-checked by the server before they are granted.
 */
export type Focus =
  | { kind: "portal"; id: string; promptKey: string; portal: Portal; distance: number }
  | { kind: "message"; id: string; promptKey: string; messageKey: string; distance: number };

export function findFocus(zone: ZoneDefinition, x: number, z: number): Focus | null {
  let best: Focus | null = null;
  for (const p of zone.portals) {
    const d = Math.hypot(x - p.position[0], z - p.position[1]);
    if (d <= p.radius && (!best || d < best.distance))
      best = { kind: "portal", id: p.id, promptKey: p.promptKey, portal: p, distance: d };
  }
  for (const o of zone.objects) {
    const i = o.interaction;
    if (!i) continue;
    const d = Math.hypot(x - o.position[0], z - o.position[2]);
    if (d > i.radius || (best && best.distance <= d)) continue;
    if (i.action.type === "portal") {
      const portalId = i.action.portalId;
      const portal = zone.portals.find((p) => p.id === portalId);
      if (portal) best = { kind: "portal", id: portal.id, promptKey: i.promptKey, portal, distance: d };
    } else {
      best = {
        kind: "message",
        id: o.id,
        promptKey: i.promptKey,
        messageKey: i.action.messageKey,
        distance: d,
      };
    }
  }
  return best;
}
