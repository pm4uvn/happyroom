"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, PartyPopper, Send, X } from "lucide-react";
import { LIMITS, sendPublicWishInputSchema } from "@happyroom/shared";
import { cn } from "@happyroom/ui";
import { ctaClass } from "./cta-class";
import type { PublicCelebration } from "./model";

type Phase = { kind: "form" } | { kind: "sending" } | { kind: "success" } | { kind: "error"; code: string };

const TEMPLATE_COUNT = 5;

/**
 * "Send congratulations" from the Explore dashboard — no 3D room, no join grant. Always lands
 * pending: the host approves it from inside the party room before anyone sees it (see
 * lib/server/public-wishes.ts). Never auto-submits a template; the visitor always presses Send.
 */
export function WishPanel({ item, onClose }: { item: PublicCelebration; onClose: () => void }) {
  const t = useTranslations("explore.wish");
  const titleId = useId();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const bodyLeft = LIMITS.publicWishMaxChars - [...body].length;
  const parsed = sendPublicWishInputSchema.safeParse({
    roomId: item.id,
    displayName: name,
    body,
    idempotencyKey,
  });

  const submit = async () => {
    if (!parsed.success) return;
    setPhase({ kind: "sending" });
    try {
      const res = await fetch("/api/explore/wishes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        setPhase({ kind: "success" });
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setPhase({ kind: "error", code: data?.error ?? "generic" });
    } catch {
      setPhase({ kind: "error", code: "network" });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-midnight/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      data-testid="wish-panel"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-t-[2rem] bg-midnight-900 p-5 text-white ring-1 ring-white/12 sm:rounded-[2rem]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-night-muted">{item.name}</p>
            <h3 id={titleId} className="mt-0.5 font-display text-xl font-extrabold">
              {t("title")}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-white/8 ring-1 ring-white/10 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        {phase.kind === "success" ? (
          <div className="mt-5 flex flex-col items-center gap-3 text-center" data-testid="wish-success">
            <CheckCircle2 aria-hidden className="size-10 text-mint" />
            <p className="font-display text-lg font-extrabold">{t("successTitle")}</p>
            <p className="text-sm text-night-muted">{t("successBody")}</p>
            <Link href="/create" className={ctaClass("primary")} data-testid="wish-success-create">
              <PartyPopper aria-hidden className="size-4" /> {t("successCta")}
            </Link>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t("nameLabel")}
              <input
                type="text"
                value={name}
                maxLength={LIMITS.displayNameMaxChars}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                className="rounded-xl bg-white/8 px-3 py-2 text-sm text-white ring-1 ring-white/15 placeholder:text-night-muted/70"
                data-testid="wish-name"
                disabled={phase.kind === "sending"}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              <span className="flex items-center justify-between">
                {t("bodyLabel")}
                <span className="text-xs font-normal text-night-muted">{bodyLeft}</span>
              </span>
              <textarea
                value={body}
                maxLength={LIMITS.publicWishMaxChars * 4}
                rows={3}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("bodyPlaceholder")}
                className="resize-none rounded-xl bg-white/8 px-3 py-2 text-sm text-white ring-1 ring-white/15 placeholder:text-night-muted/70"
                data-testid="wish-body"
                disabled={phase.kind === "sending"}
              />
            </label>
            <div className="flex flex-wrap gap-1.5" data-testid="wish-templates">
              {Array.from({ length: TEMPLATE_COUNT }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBody(t(`templates.t${n}`))}
                  className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold text-night-muted ring-1 ring-white/10 hover:bg-white/12 hover:text-white"
                  data-testid={`wish-template-${n}`}
                >
                  {t(`templates.t${n}`)}
                </button>
              ))}
            </div>

            {phase.kind === "error" && (
              <p className="text-sm font-semibold text-danger" role="alert" data-testid="wish-error">
                {t.has(`errors.${phase.code}`) ? t(`errors.${phase.code}`) : t("errors.generic")}
              </p>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!parsed.success || phase.kind === "sending"}
              className={cn(ctaClass("primary"), "justify-center")}
              data-testid="wish-send"
            >
              {phase.kind === "sending" ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Send aria-hidden className="size-4" />
              )}
              {phase.kind === "sending" ? t("sending") : t("send")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
