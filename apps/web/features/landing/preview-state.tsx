"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EMOTES, type EmoteId, type ThemeId } from "@happyroom/shared";

/**
 * Local-only state of the landing page's 3D preview. Nothing here is networked or persisted;
 * the UI labels the preview accordingly. Live rooms use the authoritative game server instead.
 */
interface PreviewState {
  themeId: ThemeId;
  candlesLit: boolean;
  confettiKey: number;
  emote: { id: EmoteId; key: number } | null;
  celebrating: boolean;
  setTheme: (id: ThemeId) => void;
  blowCandles: () => void;
  relight: () => void;
  sendEmote: (id: EmoteId) => void;
  /** Scroll the preview into view and move focus to it (used by section buttons). */
  focusPreview: () => void;
  registerPreview: (el: HTMLElement | null) => void;
}

const Ctx = createContext<PreviewState | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [themeId, setTheme] = useState<ThemeId>("cozy_twilight");
  const [candlesLit, setCandlesLit] = useState(true);
  const [confettiKey, setConfettiKey] = useState(0);
  const [emote, setEmote] = useState<PreviewState["emote"]>(null);
  const [celebrating, setCelebrating] = useState(false);
  const previewEl = useRef<HTMLElement | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const litRef = useRef(true);

  const blowCandles = useCallback(() => {
    if (!litRef.current) return;
    litRef.current = false;
    setCandlesLit(false);
    setConfettiKey((k) => k + 1);
    setCelebrating(true);
    later(() => setCelebrating(false), 3200);
  }, []);

  const relight = useCallback(() => {
    litRef.current = true;
    setCandlesLit(true);
  }, []);

  const sendEmote = useCallback((id: EmoteId) => {
    const key = Date.now();
    setEmote({ id, key });
    later(() => setEmote((cur) => (cur && cur.key === key ? null : cur)), EMOTES[id].durationMs);
  }, []);

  const registerPreview = useCallback((el: HTMLElement | null) => {
    previewEl.current = el;
  }, []);

  const focusPreview = useCallback(() => {
    const el = previewEl.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }, []);

  const value = useMemo(
    () => ({
      themeId,
      candlesLit,
      confettiKey,
      emote,
      celebrating,
      setTheme,
      blowCandles,
      relight,
      sendEmote,
      focusPreview,
      registerPreview,
    }),
    [
      themeId,
      candlesLit,
      confettiKey,
      emote,
      celebrating,
      blowCandles,
      relight,
      sendEmote,
      focusPreview,
      registerPreview,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreview(): PreviewState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePreview must be used inside <PreviewProvider>");
  return v;
}
