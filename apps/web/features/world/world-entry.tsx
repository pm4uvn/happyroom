"use client";

import dynamic from "next/dynamic";
import type { WorldProfile } from "./world-client";

// Three.js, R3F and the Colyseus SDK are loaded only on the client.
const WorldClient = dynamic(() => import("./world-client").then((m) => m.WorldClient), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-dvh place-items-center bg-gradient-to-br from-dream-100 via-pink-100 to-mint-100"
      data-testid="world-boot"
    >
      <span className="animate-float text-5xl" aria-hidden>
        🌍
      </span>
    </div>
  ),
});

export function WorldEntry(props: { profile: WorldProfile; initialZone: string; initialSpawn?: string }) {
  return <WorldClient {...props} />;
}
