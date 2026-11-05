"use client";

import type { AnalyticsEvent, AnalyticsEventName, DeviceClass, SupportedLocale } from "@happyroom/shared";

/**
 * Browser analytics client.
 *  - Consent "granted": events carry a random, device-local anonymous id (localStorage).
 *  - Consent "denied" or not yet chosen: events are sent as anonymous aggregates with NO identifier
 *    and nothing is written to the device besides the consent choice itself.
 *  - Do Not Track / Global Privacy Control are treated as "denied".
 * Events go to the first-party endpoint /api/events (validated server-side). PostHog forwarding
 * is backlog item M8-02 and is not active.
 */
export type ConsentState = "granted" | "denied" | "unset";

const CONSENT_KEY = "hr_analytics_consent";
const ANON_KEY = "hr_anon_id";
const CONSENT_EVENT = "hr:consent-change";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode / blocked): fall back to anonymous */
  }
}

export function browserPrivacySignal(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return "unset";
  if (browserPrivacySignal()) return "denied";
  const v = safeGet(CONSENT_KEY);
  return v === "granted" || v === "denied" ? v : "unset";
}

export function setConsent(state: Exclude<ConsentState, "unset">) {
  safeSet(CONSENT_KEY, state);
  if (state === "denied") safeSet(ANON_KEY, null);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
}

export function onConsentChange(cb: (s: ConsentState) => void): () => void {
  const handler = () => cb(getConsent());
  window.addEventListener(CONSENT_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CONSENT_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function anonymousId(): string | undefined {
  if (getConsent() !== "granted") return undefined;
  let id = safeGet(ANON_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(ANON_KEY, id);
  }
  return id;
}

export function detectDeviceClass(): DeviceClass {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

export function buildEvent<N extends AnalyticsEventName>(
  name: N,
  properties: AnalyticsEvent<N>["properties"],
  locale?: SupportedLocale,
): AnalyticsEvent<N> {
  const id = anonymousId();
  return {
    name,
    properties,
    occurredAt: new Date().toISOString(),
    ...(id ? { anonymousId: id } : {}),
    ...(locale ? { locale } : {}),
    deviceClass: detectDeviceClass(),
  };
}

export function track<N extends AnalyticsEventName>(
  name: N,
  properties: AnalyticsEvent<N>["properties"],
  locale?: SupportedLocale,
): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ events: [buildEvent(name, properties, locale)] });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/events", blob)) return;
  } catch {
    /* fall through to fetch */
  }
  void fetch("/api/events", {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
    keepalive: true,
  }).catch(() => {
    /* analytics must never break the product */
  });
}
