import "server-only";
import type { DiscoveryResponse, PublicCelebration } from "@/features/explore/model";
import { demoCelebrations } from "./explore-demo";

/**
 * Public celebration discovery.
 *
 * Today every room is private (invite link or access code) and the schema has no host opt-in for
 * public listing and no public country field. Having an invite link does NOT make a room public,
 * so the live result is honestly empty. Enabling discovery needs (see docs/EXPLORE.md):
 *   rooms.discoverable boolean default false, rooms.public_name, rooms.public_country (host-chosen),
 *   a host opt-in UI with moderation, and a join path that keeps invitations/grants/capacity checks.
 */
export const DISCOVERY_ENABLED = false;

export function demoAvailable(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.EXPLORE_DEMO_ENABLED === "true";
}

async function listLiveCelebrations(): Promise<PublicCelebration[]> {
  // No opted-in rooms can exist yet (see above), so nothing is read from the rooms table.
  return [];
}

export async function getDiscovery(opts: { demo: boolean }): Promise<DiscoveryResponse> {
  const allowDemo = demoAvailable();
  if (opts.demo && allowDemo) {
    return {
      mode: "demo",
      discoveryEnabled: DISCOVERY_ENABLED,
      demoAvailable: true,
      celebrations: demoCelebrations(),
    };
  }
  return {
    mode: "live",
    discoveryEnabled: DISCOVERY_ENABLED,
    demoAvailable: allowDemo,
    celebrations: DISCOVERY_ENABLED ? await listLiveCelebrations() : [],
  };
}
