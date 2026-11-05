"use client";

import { useSyncExternalStore } from "react";
import { SharePanel } from "@/features/share/share-panel";

const noop = () => () => {};

/** Shares the landing page itself. Uses the configured public URL, falling back to the current origin. */
export function LandingShare({
  configuredUrl,
  title,
  text,
}: {
  configuredUrl?: string;
  title: string;
  text: string;
}) {
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => configuredUrl ?? "",
  );
  const url = configuredUrl || origin;
  if (!url) return null;
  return <SharePanel url={url} title={title} text={text} />;
}
