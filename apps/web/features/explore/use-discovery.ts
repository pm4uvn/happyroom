"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { discoveryResponseSchema, type DiscoveryResponse } from "./model";

export type DiscoveryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; data: DiscoveryResponse };

const POLL_MS = 15_000;

/**
 * Loads public celebrations from /api/explore/celebrations (validated against the public
 * contract), then keeps them current with the same bounded-polling pattern as useSummary — a
 * room's "live" state is confirmed game-server presence, which can start or end at any moment,
 * so a list fetched once at page load would silently go stale (a host starting or ending their
 * celebration, or switching discovery off, would never show up without a manual reload).
 * Pauses while the tab is hidden; refetches immediately when it becomes visible again.
 */
export function useDiscovery(demo: boolean): DiscoveryState & { retry: () => void } {
  const [state, setState] = useState<DiscoveryState>({ status: "loading" });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, POLL_MS);
    };

    async function load() {
      try {
        const res = await fetch(`/api/explore/celebrations${demo ? "?demo=1" : ""}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const parsed = discoveryResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error("invalid response");
        if (alive) setState({ status: "ready", data: parsed.data });
      } catch {
        if (alive && stateRef.current.status !== "ready") setState({ status: "error" });
      } finally {
        if (alive && document.visibilityState === "visible") schedule();
      }
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      timer = null;
      void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    void load();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
