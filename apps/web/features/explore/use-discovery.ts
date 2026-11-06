"use client";

import { useCallback, useEffect, useState } from "react";
import { discoveryResponseSchema, type DiscoveryResponse } from "./model";

export type DiscoveryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; data: DiscoveryResponse };

/** Loads public celebrations from /api/explore/celebrations (validated against the public contract). */
export function useDiscovery(demo: boolean): DiscoveryState & { retry: () => void } {
  const [state, setState] = useState<DiscoveryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/explore/celebrations${demo ? "?demo=1" : ""}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const parsed = discoveryResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error("invalid response");
        setState({ status: "ready", data: parsed.data });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, [demo, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  }, []);

  return { ...state, retry };
}
