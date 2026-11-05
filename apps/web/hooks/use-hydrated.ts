"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** False during SSR and the hydration pass, true afterwards. Avoids hydration mismatches. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
