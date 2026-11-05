"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Share2 } from "lucide-react";
import { Button } from "@happyroom/ui";
import { toQrDataUrl } from "./qr";

export interface SharePanelProps {
  url: string;
  title: string;
  text: string;
  /** Called after a successful share action (for analytics in room contexts). */
  onShared?: (channel: "copy_link" | "native_share") => void;
}

const noop = () => () => {};
const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/**
 * Reusable share UI: copy link, native share sheet (where supported) and a QR code.
 * Works in any app that opens links (WhatsApp, Messenger, LINE, Telegram, Instagram…);
 * nothing is sent automatically and no contacts are accessed.
 */
export function SharePanel({ url, title, text, onShared }: SharePanelProps) {
  const t = useTranslations("share");
  const nativeShare = useSyncExternalStore(noop, canNativeShare, () => false);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [qr, setQr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    toQrDataUrl(url).then(
      (d) => !cancelled && setQr(d),
      () => !cancelled && setQr(null),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (copied === "idle") return;
    const id = window.setTimeout(() => setCopied("idle"), 2500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
      onShared?.("copy_link");
    } catch {
      inputRef.current?.select();
      setCopied("failed");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title, text, url });
      onShared?.("native_share");
    } catch {
      /* user cancelled or share failed: nothing to do */
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:items-center">
      <div className="flex flex-1 flex-col gap-3">
        <label className="sr-only" htmlFor="share-url">
          URL
        </label>
        <input
          id="share-url"
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-12 w-full rounded-2xl bg-dream-50 px-4 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-4 focus:ring-dream/35"
          data-testid="share-url"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={copy} data-testid="share-copy">
            {copied === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied === "copied" ? t("copied") : t("copy")}
          </Button>
          {nativeShare && (
            <Button variant="secondary" onClick={share}>
              <Share2 aria-hidden /> {t("native")}
            </Button>
          )}
        </div>
        <p aria-live="polite" className="min-h-5 text-sm text-ink-muted">
          {copied === "copied" ? t("copied") : copied === "failed" ? t("copyFailed") : ""}
        </p>
      </div>
      <figure className="flex flex-col items-center gap-2">
        <div className="grid size-40 place-items-center rounded-3xl bg-white p-3 shadow-soft ring-1 ring-line">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL, not an optimisable asset
            <img src={qr} alt={t("qrAlt", { url })} width={136} height={136} data-testid="share-qr" />
          ) : (
            <span className="size-full animate-pulse rounded-2xl bg-dream-50" aria-hidden />
          )}
        </div>
        <figcaption className="text-xs font-semibold text-ink-muted">{t("qrCaption")}</figcaption>
      </figure>
    </div>
  );
}
