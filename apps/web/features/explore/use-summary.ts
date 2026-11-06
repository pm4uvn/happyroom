"use client";

import { useEffect, useRef, useState } from "react";
import { exploreSummarySchema, type ExploreSummary } from "./model";

export type SummaryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; data: ExploreSummary };

const POLL_MS = 15_000;

/**
 * Polls /api/explore/summary on a fixed interval (not a push subscription — see docs/EXPLORE.md
 * for why polling was chosen). Pauses while the tab is hidden so a background tab never spends
 * the budget it shares with every other visitor, and refetches immediately when it becomes
 * visible again so the numbers are never stale right when someone looks.
 */
export function useSummary(demo: boolean): SummaryState {
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, POLL_MS);
    };

    async function load() {
      try {
        const res = await fetch(`/api/explore/summary${demo ? "?demo=1" : ""}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const parsed = exploreSummarySchema.safeParse(await res.json());
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
  }, [demo]);

  return state;
}
