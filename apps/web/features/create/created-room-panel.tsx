"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, DoorOpen, KeyRound } from "lucide-react";
import { Badge, Button } from "@happyroom/ui";
import { SharePanel } from "@/features/share/share-panel";

export interface CreatedRoom {
  slug: string;
  roomUrl: string;
  inviteUrl: string;
  recoveryCode: string;
}

/** Success screen: invite link + QR, one-time recovery code, and entry into the room. */
export function CreatedRoomPanel({ room }: { room: CreatedRoom }) {
  const t = useTranslations("create.done");
  const tMeta = useTranslations("meta");
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.recoveryCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the code stays visible for manual copying */
    }
  };

  const download = () => {
    const text = `${t("fileHeading")}\n\n${room.roomUrl}\n${room.recoveryCode}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `happyroom-${room.slug}-recovery.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-8" data-testid="room-created">
      <div>
        <h2 className="font-display text-3xl font-extrabold text-ink">{t("title")}</h2>
        <p className="mt-1 text-ink-soft">{t("subtitle")}</p>
        <Badge tone="dream" className="mt-3" data-testid="room-code">
          {t("roomCode", { code: room.slug })}
        </Badge>
      </div>

      <section aria-label={t("inviteLabel")}>
        <SharePanel url={room.inviteUrl} title={tMeta("title")} text={tMeta("description")} />
      </section>

      <section className="rounded-3xl bg-gold-100 p-5 ring-1 ring-gold/40" aria-labelledby="recovery-title">
        <h3 id="recovery-title" className="flex items-center gap-2 font-bold text-ink">
          <KeyRound aria-hidden className="size-5 text-gold-700" /> {t("recoveryTitle")}
        </h3>
        <p className="mt-1 text-sm text-ink-soft">{t("recoveryBody")}</p>
        <code
          className="mt-3 block rounded-xl bg-white px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-ink"
          data-testid="recovery-code"
        >
          {room.recoveryCode}
        </code>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={copyCode}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? t("codeCopied") : t("copyCode")}
          </Button>
          <Button size="sm" variant="secondary" onClick={download}>
            <Download aria-hidden /> {t("downloadCode")}
          </Button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="size-5 accent-dream"
            data-testid="recovery-ack"
          />
          {t("acknowledge")}
        </label>
      </section>

      {acknowledged ? (
        <Button asChild size="lg" className="self-start">
          <Link href={`/r/${room.slug}`} data-testid="enter-room">
            <DoorOpen aria-hidden /> {t("enter")}
          </Link>
        </Button>
      ) : (
        <Button size="lg" className="self-start" aria-disabled="true" data-testid="enter-room">
          <DoorOpen aria-hidden /> {t("enter")}
        </Button>
      )}
    </div>
  );
}
