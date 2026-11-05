"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { DoorOpen, KeyRound, Loader2 } from "lucide-react";
import { AVATAR_PRESET_IDS, AVATAR_PRESETS, type AvatarPresetId, type ThemeId } from "@happyroom/shared";
import { Badge, Button, cn } from "@happyroom/ui";
import { TextField } from "@/features/create/create-wizard";
import { SceneFallback } from "@/features/room-scene/scene-fallback";
import type { JoinTicket } from "./connection";
import { BackToPlaza, cameFromWorld } from "@/features/world/back-to-plaza";

// Three.js, R3F and the Colyseus SDK load only once the guest actually enters.
const PartyExperience = dynamic(() => import("./party-experience"), { ssr: false });

export type AccessState = "member" | "invited" | "access_code" | "invite_required" | "removed";

export interface RoomEntryProps {
  slug: string;
  themeId: ThemeId;
  honoree: string | null;
  startsAtLabel: string | null;
  access: AccessState;
  role: "host" | "cohost" | "guest" | null;
  inviteToken: string | null;
  defaultName: string;
  defaultAvatar: AvatarPresetId;
}

export function RoomEntry(props: RoomEntryProps) {
  const t = useTranslations("lobby");
  const tParty = useTranslations("party");
  const tAvatars = useTranslations("avatars");
  const router = useRouter();
  const [name, setName] = useState(props.defaultName);
  const [avatar, setAvatar] = useState<AvatarPresetId>(props.defaultAvatar);
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<JoinTicket | null>(null);
  const [showRecover, setShowRecover] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${props.slug}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          avatarPreset: avatar,
          ...(props.inviteToken ? { invitationToken: props.inviteToken } : {}),
          ...(props.access === "access_code" && accessCode ? { accessCode } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "generic");
        return;
      }
      // Drop the invitation token from the address bar once it has been used.
      if (props.inviteToken) window.history.replaceState(null, "", `/r/${props.slug}`);
      setTicket(body as JoinTicket);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  const recover = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${props.slug}/recover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recoveryCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(typeof body.error === "string" ? body.error : "generic");
      router.refresh();
      setShowRecover(false);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  const onExit = useCallback(
    (reason?: string) => {
      setTicket(null);
      if (reason && reason !== "left") setError(reason);
      if (reason === "left") router.push(cameFromWorld() ? "/world" : "/");
    },
    [router],
  );

  if (ticket) return <PartyExperience ticket={ticket} slug={props.slug} onExit={onExit} />;

  const canEnter = props.access !== "invite_required" && props.access !== "removed";
  const errorText = error
    ? t.has(`errors.${error}`)
      ? t(`errors.${error}`)
      : tParty.has(`errors.${error}`)
        ? tParty(`errors.${error}`)
        : t("errors.generic")
    : null;

  return (
    <main id="main" className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <SceneFallback themeId={props.themeId} className="absolute inset-0 h-full w-full opacity-70" />
      <div
        className="relative w-full max-w-lg rounded-[2rem] bg-white/95 p-6 shadow-lift ring-1 ring-line backdrop-blur sm:p-8"
        data-testid="lobby"
        data-access={props.access}
      >
        <BackToPlaza className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-dream-700 hover:underline" />
        <div className="flex flex-wrap gap-2">
          {props.role === "host" ? (
            <Badge tone="gold">{t("hostBadge")}</Badge>
          ) : props.access === "member" ? (
            <Badge tone="mint">{t("memberBadge")}</Badge>
          ) : props.access === "invited" ? (
            <Badge tone="pink">{t("invitedBadge")}</Badge>
          ) : null}
        </div>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-ink">
          {props.honoree ? t("title", { name: props.honoree }) : t("lockedTitle")}
        </h1>
        {props.startsAtLabel && (
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            {t("startsAt", { time: props.startsAtLabel })}
          </p>
        )}

        {canEnter ? (
          <form
            noValidate
            className="mt-6 flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <TextField
              id="display-name"
              label={t("nameLabel")}
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={setName}
              maxLength={48}
              autoComplete="nickname"
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-ink" id="avatar-label">
                {t("avatarLabel")}
              </span>
              <div
                role="radiogroup"
                aria-labelledby="avatar-label"
                className="grid grid-cols-3 gap-2 sm:grid-cols-6"
              >
                {AVATAR_PRESET_IDS.map((id) => {
                  const p = AVATAR_PRESETS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={avatar === id}
                      onClick={() => setAvatar(id)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-2xl p-2 text-xs font-bold text-ink ring-1",
                        avatar === id ? "bg-dream-50 ring-2 ring-dream" : "ring-line hover:bg-dream-50",
                      )}
                      data-testid={`avatar-${id}`}
                    >
                      <span className="relative block size-10" aria-hidden>
                        <span
                          className="absolute inset-x-1 bottom-0 h-6 rounded-t-full"
                          style={{ background: p.body }}
                        />
                        <span
                          className="absolute left-1/2 top-0 size-6 -translate-x-1/2 rounded-full ring-2"
                          style={{ background: "#FFF3EA", boxShadow: `0 0 0 2px ${p.accent}` }}
                        />
                      </span>
                      {tAvatars(id)}
                    </button>
                  );
                })}
              </div>
            </div>
            {props.access === "access_code" && (
              <TextField
                id="access-code"
                label={t("accessCodeLabel")}
                help={t("accessCodeHelp")}
                value={accessCode}
                onChange={(v) => setAccessCode(v.toUpperCase())}
                maxLength={12}
                autoComplete="off"
              />
            )}
            {errorText && (
              <p
                role="alert"
                className="rounded-2xl bg-pink-100 p-3 text-sm font-semibold text-danger"
                data-testid="lobby-error"
              >
                {errorText}
              </p>
            )}
            <Button type="submit" size="lg" disabled={busy || !name.trim()} data-testid="lobby-enter">
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <DoorOpen aria-hidden />}
              {busy ? t("entering") : t("enter")}
            </Button>
            <p className="text-xs text-ink-muted">{t("privacyNote")}</p>
          </form>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-ink-soft">
              {props.access === "removed" ? t("errors.removed") : t("lockedBody")}
            </p>
            {errorText && (
              <p
                role="alert"
                className="rounded-2xl bg-pink-100 p-3 text-sm font-semibold text-danger"
                data-testid="lobby-error"
              >
                {errorText}
              </p>
            )}
          </div>
        )}

        {props.role !== "host" && props.access !== "removed" && (
          <div className="mt-6 border-t border-line pt-4">
            {showRecover ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void recover();
                }}
              >
                <TextField
                  id="recovery"
                  label={t("recoverLabel")}
                  value={recoveryCode}
                  onChange={setRecoveryCode}
                  maxLength={40}
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  disabled={busy || recoveryCode.length < 8}
                >
                  <KeyRound aria-hidden /> {busy ? t("recovering") : t("recoverSubmit")}
                </Button>
              </form>
            ) : (
              <button
                type="button"
                className="text-sm font-semibold text-dream-700 underline-offset-4 hover:underline"
                onClick={() => setShowRecover(true)}
              >
                {t("recoverLink")}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
