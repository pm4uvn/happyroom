"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { AVATAR_PRESETS } from "@happyroom/shared";
import { AGE_BANDS, AVATAR_IDS, type AgeBand, type WorldAvatarId } from "@happyroom/world";
import { Button, cn } from "@happyroom/ui";
import { TextField } from "@/features/create/create-wizard";
import { useHydrated } from "@/hooks/use-hydrated";

export function CharacterForm(props: {
  displayName: string;
  avatar: WorldAvatarId;
  ageBand: AgeBand;
  chatEnabled: boolean;
  showInPlayerList: boolean;
  isPlaceholderName: boolean;
}) {
  const t = useTranslations("character");
  const tAv = useTranslations("avatars");
  const router = useRouter();
  const hydrated = useHydrated();
  const [name, setName] = useState(props.isPlaceholderName ? "" : props.displayName);
  const [avatar, setAvatar] = useState<WorldAvatarId>(props.avatar);
  const [ageBand, setAgeBand] = useState<AgeBand>(props.ageBand);
  const [chat, setChat] = useState(props.chatEnabled);
  const [listed, setListed] = useState(props.showInPlayerList);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          avatar,
          ageBand,
          chatEnabled: ageBand === "under13" ? false : chat,
          showInPlayerList: listed,
        }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(Array.isArray(b.fields) ? b.fields[0]?.code : (b.error ?? "generic"));
        return;
      }
      router.push("/world");
      router.refresh();
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="character-form"
    >
      <TextField
        id="display-name"
        disabled={!hydrated}
        label={t("name")}
        help={t("nameHelp")}
        value={name}
        onChange={setName}
        maxLength={24}
        autoComplete="nickname"
      />
      <div className="flex flex-col gap-2">
        <span id="avatar-label" className="text-sm font-bold text-ink">
          {t("avatar")}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="avatar-label"
          className="grid grid-cols-3 gap-2 sm:grid-cols-6"
        >
          {AVATAR_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={avatar === id}
              onClick={() => setAvatar(id)}
              disabled={!hydrated}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl p-2 text-xs font-bold text-ink ring-1",
                avatar === id ? "bg-dream-50 ring-2 ring-dream" : "ring-line hover:bg-dream-50",
              )}
              data-testid={`character-avatar-${id}`}
            >
              <span className="relative block size-10" aria-hidden>
                <span
                  className="absolute inset-x-1 bottom-0 h-6 rounded-t-full"
                  style={{ background: AVATAR_PRESETS[id].body }}
                />
                <span
                  className="absolute left-1/2 top-0 size-6 -translate-x-1/2 rounded-full"
                  style={{ background: "#FFF3EA", boxShadow: `0 0 0 2px ${AVATAR_PRESETS[id].accent}` }}
                />
              </span>
              {tAv(id)}
            </button>
          ))}
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold text-ink">{t("age")}</legend>
        <div className="flex flex-wrap gap-2">
          {AGE_BANDS.map((b) => (
            <label
              key={b}
              className={cn(
                "cursor-pointer rounded-full px-4 py-2 text-sm font-bold ring-1",
                ageBand === b ? "bg-dream text-white ring-dream" : "bg-white text-ink ring-line",
              )}
            >
              <input
                type="radio"
                name="age"
                value={b}
                checked={ageBand === b}
                onChange={() => setAgeBand(b)}
                disabled={!hydrated}
                className="sr-only"
                data-testid={`age-${b}`}
              />
              {t(`ages.${b}`)}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-muted">{t("ageHelp")}</p>
      </fieldset>
      <label
        className={cn(
          "flex items-center gap-2 text-sm font-semibold text-ink",
          ageBand === "under13" && "opacity-50",
        )}
      >
        <input
          type="checkbox"
          className="size-5 accent-dream"
          checked={ageBand !== "under13" && chat}
          disabled={ageBand === "under13"}
          onChange={(e) => setChat(e.target.checked)}
        />
        {t("chat")}
      </label>
      <label className="-mt-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          className="size-5 accent-dream"
          checked={listed}
          onChange={(e) => setListed(e.target.checked)}
        />
        {t("listed")}
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-2xl bg-pink-100 p-3 text-sm font-semibold text-danger"
          data-testid="character-error"
        >
          {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={busy || !hydrated || name.trim().length < 2}
        data-testid="character-save"
      >
        {busy && <Loader2 aria-hidden className="animate-spin" />} {busy ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
