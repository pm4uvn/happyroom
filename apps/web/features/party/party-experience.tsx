"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Camera,
  Gift as GiftIcon,
  Globe2,
  Lock,
  LogOut,
  Sparkles,
  Unlock,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  CAKE_STYLES,
  DECORATION_PRESETS,
  EMOTE_IDS,
  EMOTES,
  GIFT_CATALOG_IDS,
  GIFTS,
  THEME_IDS,
  type CakeStyle,
  type DecorationPreset,
  type ThemeId,
} from "@happyroom/shared";
import { Badge, Button, cn } from "@happyroom/ui";
import { COUNTRIES, countryName } from "@/features/explore/countries";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { detectQualityTier, probeGpu } from "@/features/room-scene/capabilities";
import { AvatarTag, createLabelRegistry, Label, LabelLayer } from "@/features/room-scene/labels";
import { PartyScene } from "@/features/room-scene/party-scene";
import { SceneFallback } from "@/features/room-scene/scene-fallback";
import { SharePanel } from "@/features/share/share-panel";
import { isSupportedLocale } from "@/i18n/locale";
import { track } from "@/lib/analytics/client";
import { PartyConnection, type JoinTicket, type PartyNotice, type PlayerView } from "./connection";
import { bindKeyboard, createMoveInput } from "./input";
import { Joystick } from "./joystick";
import { CameraRig, LocalPlayer, RemotePlayer, type LocalPose } from "./party-players";
import { composeShareCard } from "./snapshot";
import { cameFromWorld } from "@/features/world/back-to-plaza";

type Panel = "people" | "wishes" | "gifts" | null;

const pick = <T extends string>(list: readonly T[], v: string, fallback: T): T =>
  (list as readonly string[]).includes(v) ? (v as T) : fallback;

/** The live party: authoritative multiplayer state rendered in 3D plus the party HUD. */
export default function PartyExperience({
  ticket,
  slug,
  onExit,
}: {
  ticket: JoinTicket;
  slug: string;
  onExit: (reason?: string) => void;
}) {
  const t = useTranslations("party");
  const tAll = useTranslations();
  const locale = useLocale();
  const loc = isSupportedLocale(locale) ? locale : undefined;
  const reducedMotion = useReducedMotion();

  const [conn] = useState(() => new PartyConnection(ticket));
  const [fromWorld] = useState(() => typeof window !== "undefined" && cameFromWorld());
  useSyncExternalStore(conn.subscribe, conn.getVersion, conn.getVersion);
  const view = conn.view;

  const inputRef = useRef(createMoveInput());
  const poseRef = useRef<LocalPose>({ x: 0, z: 0, rotY: 0, ready: false });
  const [registry] = useState(createLabelRegistry);
  const [gpu] = useState(() =>
    typeof window === "undefined" ? { webgl: true, software: false } : probeGpu(),
  );
  const [quality] = useState(() => (typeof window === "undefined" ? "low" : detectQualityTier(gpu)));
  const [coarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  );
  const [panel, setPanel] = useState<Panel>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [photo, setPhoto] = useState<{ url: string; blob: Blob } | null>(null);
  const captureRef = useRef<(() => HTMLCanvasElement) | null>(null);
  const joinedAt = useRef(0);
  const firstInteraction = useRef(false);

  const toast = useCallback((text: string) => {
    const id = Math.random();
    setToasts((ts) => [...ts.slice(-3), { id, text }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3500);
  }, []);

  const interacted = useCallback(
    (kind: "move" | "emote" | "chat" | "wish" | "gift" | "ceremony") => {
      if (firstInteraction.current) return;
      firstInteraction.current = true;
      track(
        "guest_first_interaction",
        {
          roomId: ticket.partyId,
          kind,
          secondsSinceJoin: Math.min(86_400, Math.round((Date.now() - joinedAt.current) / 1000)),
        },
        loc,
      );
    },
    [ticket.partyId, loc],
  );

  // Connect once; leave on unmount.
  useEffect(() => {
    joinedAt.current = Date.now();
    conn.connect().catch(() => {});
    const offKeys = bindKeyboard(inputRef.current);
    const offNotice = conn.onNotice((n: PartyNotice) => {
      if (n.kind === "error")
        toast(t.has(`errors.${n.code}`) ? t(`errors.${n.code}`) : t("errors.invalid_payload"));
      else if (n.kind === "wishReceived")
        toast(n.status === "approved" ? t("wish.sentApproved") : t("wish.sent"));
      else if (n.kind === "giftReceived") toast(t("gift.sent"));
      else if (n.kind === "snapshotTaken") toast(t("snapshot.taken", { name: n.name }));
      else if (n.kind === "hostDiscoverySaved")
        toast(n.discoverable ? t("discovery.savedOn") : t("discovery.savedOff"));
    });
    return () => {
      offKeys();
      offNotice();
      void conn.leave();
    };
  }, [conn, t, toast]);

  // Session ended by the server (kicked / replaced / idle).
  useEffect(() => {
    if (conn.status !== "disconnected") return;
    const reason =
      conn.endedCode === 4003
        ? "kicked"
        : conn.endedCode === 4001
          ? "replaced"
          : conn.endedCode === 4004
            ? "idle"
            : undefined;
    if (reason) onExit(reason);
  }, [conn.status, conn.endedCode, onExit]);

  const me = view?.players.find((p) => p.id === conn.selfId);
  const others = view?.players.filter((p) => p.id !== conn.selfId) ?? [];
  const isHost = conn.role === "host";
  const isMod = conn.role === "host" || conn.role === "cohost";
  const ceremony = view?.ceremony;
  const phase = ceremony?.phase ?? "IDLE";
  const candlesLit = phase === "IDLE" || phase === "PREPARING" || phase === "COUNTDOWN";
  const celebrating = phase === "CELEBRATION";
  const focusCake =
    phase === "PREPARING" || phase === "COUNTDOWN" || phase === "CANDLES_OUT" || phase === "CELEBRATION";
  const confettiKey = ceremony && (phase === "CANDLES_OUT" || phase === "CELEBRATION") ? ceremony.run : 0;
  const online = view?.players.filter((p) => p.connected).length ?? 0;
  const themeId = pick<ThemeId>(THEME_IDS, view?.themeId ?? "", "cozy_twilight");

  // Countdown display driven by server timestamps + measured clock offset.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (phase !== "COUNTDOWN" && phase !== "PREPARING") return;
    const id = window.setInterval(() => setTick((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [phase]);
  const serverNow = conn.serverNow();
  const secondsLeft =
    ceremony && phase === "COUNTDOWN" ? Math.ceil((ceremony.countdownEndsAt - serverNow) / 1000) : 0;
  const canBlow = phase === "COUNTDOWN" && !!ceremony && serverNow >= ceremony.countdownEndsAt;

  const blownByName = ceremony?.blownBy
    ? view?.players.find((p) => p.id === ceremony.blownBy)?.name
    : undefined;
  const banner =
    phase === "PREPARING"
      ? t("ceremony.preparing")
      : phase === "COUNTDOWN"
        ? canBlow
          ? t("ceremony.blow")
          : t("ceremony.countdown")
        : phase === "CANDLES_OUT"
          ? ceremony?.autoBlown
            ? t("ceremony.autoBlown")
            : t("ceremony.blownBy", { name: blownByName ?? "🎉" })
          : phase === "CELEBRATION"
            ? t("ceremony.celebrate", { name: view?.honoree ?? "" })
            : phase === "COMPLETE"
              ? t("ceremony.complete")
              : null;

  const send = conn.send.bind(conn);

  const takePhoto = async () => {
    const canvas = captureRef.current?.();
    if (!canvas || !view) return;
    try {
      const blob = await composeShareCard(
        canvas,
        tAll("party.title", { name: view.honoree }),
        window.location.origin,
      );
      setPhoto({ url: URL.createObjectURL(blob), blob });
      send("snapshot", {});
      track("snapshot_created", { roomId: ticket.partyId }, loc);
    } catch {
      toast(t("errors.invalid_transition"));
    }
  };

  if (!view || !me) {
    return (
      <div className="relative grid h-dvh place-items-center bg-dream-100" data-testid="party-connecting">
        <SceneFallback themeId={themeId} className="absolute inset-0 h-full w-full opacity-60" />
        <div className="relative flex flex-col items-center gap-3 rounded-3xl bg-white/90 p-6 text-center shadow-lift">
          <span className="text-4xl" aria-hidden>
            🎈
          </span>
          <p role="status" className="font-bold text-ink">
            {conn.status === "error" ? t("errors.connect_failed") : t("status.connecting")}
          </p>
          {conn.status === "error" && <Button onClick={() => onExit()}>{t("retry")}</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-ink" data-testid="party-room" data-phase={phase}>
      {/* 3D scene */}
      <div className="absolute inset-0">
        {gpu.webgl ? (
          <>
            <PartyScene
              ariaLabel={t("title", { name: view.honoree })}
              themeId={themeId}
              cakeStyle={pick<CakeStyle>(CAKE_STYLES, view.cakeStyle, "berry_dream")}
              decoration={pick<DecorationPreset>(DECORATION_PRESETS, view.decoration, "balloons_pastel")}
              candlesLit={candlesLit}
              confettiKey={confettiKey}
              quality={quality}
              reducedMotion={reducedMotion}
              allowOrbit={false}
              cakeLabel={tAll("scene.cake")}
              onCakeActivate={canBlow ? () => (send("blowCandles", {}), interacted("ceremony")) : undefined}
              onCaptureReady={(capture) => (captureRef.current = capture)}
              roomAsset="auto"
            >
              <CameraRig poseRef={poseRef} focusCake={focusCake} reducedMotion={reducedMotion} />
              <LocalPlayer
                conn={conn}
                me={me}
                inputRef={inputRef}
                poseRef={poseRef}
                registry={registry}
                celebrating={celebrating}
                reducedMotion={reducedMotion}
                onFirstMove={() => interacted("move")}
              />
              {others.map((p) => (
                <RemotePlayer
                  key={p.id}
                  conn={conn}
                  player={p}
                  registry={registry}
                  celebrating={celebrating}
                  reducedMotion={reducedMotion}
                />
              ))}
            </PartyScene>
            <LabelLayer>
              {view.players.map((p) => (
                <Label key={p.id} id={p.id} registry={registry}>
                  <AvatarTag
                    name={`${p.id === conn.selfId ? t("you") : p.name}${p.role === "host" ? " 👑" : ""}${p.connected ? "" : ` · ${t("offline")}`}`}
                    bubble={p.emote ? EMOTES[p.emote as keyof typeof EMOTES]?.icon : null}
                  />
                </Label>
              ))}
            </LabelLayer>
          </>
        ) : (
          <SceneFallback
            themeId={themeId}
            candlesLit={candlesLit}
            className="h-full w-full"
            title={tAll("demo.fallbackTitle")}
          />
        )}
      </div>

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
        <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl bg-white/90 px-4 py-2 shadow-soft backdrop-blur">
          <h1
            className="font-display text-lg font-extrabold leading-tight text-ink"
            data-testid="party-title"
          >
            {t("title", { name: view.honoree })}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-soft">
            <span data-testid="online-count" data-count={online}>
              <Users aria-hidden className="mr-1 inline size-3.5" />
              {t("online", { count: online })}
            </span>
            {isHost && <Badge tone="gold">{t("host")}</Badge>}
            <StatusChip status={conn.status} label={t(`status.${conn.status}`)} />
            {view.locked && <Lock aria-label={tAll("party.moderation.lock")} className="size-3.5" />}
          </div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          {isHost && (
            <Button size="sm" onClick={() => setInviteOpen(true)} data-testid="invite-open">
              <UserPlus aria-hidden /> {t("invite")}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onExit("left")}
            aria-label={fromWorld ? tAll("world.backToPlaza") : t("leave")}
            data-testid="party-leave"
          >
            <LogOut aria-hidden />
            <span className="hidden sm:inline">{fromWorld ? tAll("world.backToPlaza") : t("leave")}</span>
          </Button>
        </div>
      </header>

      {/* Ceremony banner + countdown */}
      {banner && (
        <div
          className="pointer-events-none absolute inset-x-0 top-24 flex flex-col items-center gap-2 px-4"
          aria-live="polite"
        >
          <p
            className="animate-pop-in rounded-full bg-white/95 px-5 py-2 text-center font-display text-lg font-extrabold text-ink shadow-lift"
            data-testid="ceremony-banner"
          >
            {banner}
          </p>
          {phase === "COUNTDOWN" && secondsLeft > 0 && (
            <span
              className="font-display text-7xl font-extrabold text-white drop-shadow-lg"
              data-testid="countdown"
            >
              {secondsLeft}
            </span>
          )}
        </div>
      )}

      {/* Toasts */}
      <div
        className="pointer-events-none absolute inset-x-0 top-40 flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((x) => (
          <p
            key={x.id}
            className="animate-pop-in rounded-full bg-ink/85 px-4 py-1.5 text-sm font-semibold text-white"
          >
            {x.text}
          </p>
        ))}
      </div>

      {/* Mobile joystick */}
      {coarse && (
        <div className="pointer-events-none absolute bottom-28 left-4 pb-[env(safe-area-inset-bottom)]">
          <Joystick inputRef={inputRef} label={t("joystick")} />
        </div>
      )}

      {/* Bottom action bar */}
      <nav
        aria-label={t("actions.emotes")}
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {canBlow && (
          <Button
            size="lg"
            variant="party"
            className="pointer-events-auto animate-pop-in"
            onClick={() => (send("blowCandles", {}), interacted("ceremony"))}
            data-testid="blow-candles"
          >
            🌬️ {t("ceremony.blow")}
          </Button>
        )}
        {isHost && (phase === "IDLE" || phase === "COMPLETE") && (
          <Button
            size="lg"
            className="pointer-events-auto"
            onClick={() => (
              send(phase === "IDLE" ? "ceremonyStart" : "ceremonyRestart", {}),
              interacted("ceremony")
            )}
            data-testid="ceremony-start"
          >
            🎂 {phase === "IDLE" ? t("ceremony.start") : t("ceremony.restart")}
          </Button>
        )}
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-3xl bg-white/90 p-1.5 shadow-lift backdrop-blur">
          {EMOTE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => (send("emote", { emote: id }), interacted("emote"))}
              aria-label={tAll(`emotes.${id}`)}
              title={tAll(`emotes.${id}`)}
              className="grid size-10 place-items-center rounded-full text-xl transition-transform hover:scale-110 hover:bg-dream-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35 active:scale-95"
              data-testid={`emote-${id}`}
            >
              <span aria-hidden>{EMOTES[id].icon}</span>
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <ActionButton
            icon={<Sparkles aria-hidden />}
            label={t("actions.wish")}
            onClick={() => setPanel("wishes")}
            testId="open-wishes"
          />
          <ActionButton
            icon={<GiftIcon aria-hidden />}
            label={t("actions.gift")}
            onClick={() => setPanel("gifts")}
            testId="open-gifts"
          />
          <ActionButton
            icon={<Users aria-hidden />}
            label={t("actions.people")}
            onClick={() => setPanel("people")}
            testId="open-people"
            badge={isMod ? conn.pendingWishes.length : 0}
          />
          {gpu.webgl && (
            <ActionButton
              icon={<Camera aria-hidden />}
              label={t("actions.photo")}
              onClick={takePhoto}
              testId="take-photo"
            />
          )}
        </div>
        <p className="text-xs font-semibold text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
          {coarse ? t("controlsMobile") : t("controlsDesktop")}
        </p>
      </nav>

      {/* Side panel (desktop) / bottom sheet (mobile) */}
      {panel && (
        <aside
          className="absolute inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-lift sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-24 sm:w-96 sm:rounded-3xl"
          aria-label={t(`panels.${panel}`)}
          data-testid={`panel-${panel}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <div role="tablist" className="flex gap-1">
              {(["people", "wishes", "gifts"] as const).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={panel === p}
                  onClick={() => setPanel(p)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-bold",
                    panel === p ? "bg-dream text-white" : "text-ink-soft hover:bg-dream-50",
                  )}
                >
                  {t(`panels.${p}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label={t("close")}
              className="grid size-9 place-items-center rounded-full hover:bg-dream-50"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          {panel === "people" && (
            <PeoplePanel
              conn={conn}
              players={view.players}
              isHost={isHost}
              isMod={isMod}
              locked={view.locked}
              giftsEnabled={view.giftsEnabled}
              discoverable={view.discoverable}
              publicName={view.publicName}
              publicCountry={view.publicCountry}
              publicIntro={view.publicIntro}
              acceptWishes={view.acceptWishes}
              showParticipantCount={view.showParticipantCount}
            />
          )}
          {panel === "wishes" && <WishesPanel conn={conn} isMod={isMod} onSent={() => interacted("wish")} />}
          {panel === "gifts" && (
            <GiftsPanel conn={conn} isHost={isHost} isMod={isMod} onSent={() => interacted("gift")} />
          )}
        </aside>
      )}

      {inviteOpen && <InviteSheet slug={slug} roomId={ticket.partyId} onClose={() => setInviteOpen(false)} />}
      {photo && (
        <PhotoSheet
          photo={photo}
          roomId={ticket.partyId}
          onClose={() => {
            URL.revokeObjectURL(photo.url);
            setPhoto(null);
          }}
        />
      )}
    </div>
  );
}

function StatusChip({ status, label }: { status: string; label: string }) {
  const color =
    status === "connected"
      ? "bg-mint"
      : status === "reconnecting" || status === "connecting"
        ? "bg-gold"
        : "bg-danger";
  return (
    <span className="inline-flex items-center gap-1" data-testid="connection-status" data-status={status}>
      <span className={cn("size-2 rounded-full", color)} aria-hidden />
      {label}
    </span>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  testId,
  badge = 0,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink hover:bg-dream-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35 [&_svg]:size-4"
      data-testid={testId}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-pink-600 text-[10px] text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function PeoplePanel({
  conn,
  players,
  isHost,
  isMod,
  locked,
  giftsEnabled,
  discoverable,
  publicName,
  publicCountry,
  publicIntro,
  acceptWishes,
  showParticipantCount,
}: {
  conn: PartyConnection;
  players: PlayerView[];
  isHost: boolean;
  isMod: boolean;
  locked: boolean;
  giftsEnabled: boolean;
  discoverable: boolean;
  publicName: string;
  publicCountry: string;
  publicIntro: string;
  acceptWishes: boolean;
  showParticipantCount: boolean;
}) {
  const t = useTranslations("party");
  const tAll = useTranslations();
  return (
    <div className="flex flex-col gap-3">
      {isHost && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => conn.send("hostLock", { locked: !locked })}
            data-testid="toggle-lock"
          >
            {locked ? <Unlock aria-hidden /> : <Lock aria-hidden />}{" "}
            {locked ? t("moderation.unlock") : t("moderation.lock")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => conn.send("hostGifts", { enabled: !giftsEnabled })}
          >
            <GiftIcon aria-hidden /> {giftsEnabled ? t("moderation.giftsOff") : t("moderation.giftsOn")}
          </Button>
        </div>
      )}
      {isHost && (
        <DiscoverySettings
          conn={conn}
          discoverable={discoverable}
          publicName={publicName}
          publicCountry={publicCountry}
          publicIntro={publicIntro}
          acceptWishes={acceptWishes}
          showParticipantCount={showParticipantCount}
        />
      )}
      <ul className="flex flex-col gap-1.5" data-testid="people-list">
        {players.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-2xl bg-dream-50 px-3 py-2"
            data-testid="person"
            data-participant-id={p.id}
            data-name={p.name}
            data-x={p.x.toFixed(1)}
            data-z={p.z.toFixed(1)}
            data-connected={p.connected}
          >
            <span className="min-w-0 truncate font-semibold text-ink">
              {p.name}
              {p.id === conn.selfId && <span className="ml-1 text-xs text-ink-muted">({t("you")})</span>}
              {p.role === "host" && (
                <Badge tone="gold" className="ml-1.5">
                  {t("host")}
                </Badge>
              )}
              {p.muted && <span className="ml-1.5 text-xs text-danger">🔇</span>}
              <span className="sr-only">{tAll(`avatars.${p.avatar}`)}</span>
            </span>
            {isMod && p.id !== conn.selfId && p.role !== "host" && (
              <span className="flex shrink-0 gap-1">
                <button
                  className="rounded-full px-2 py-1 text-xs font-bold text-ink-soft hover:bg-white"
                  onClick={() => conn.send("hostMute", { participantId: p.id, muted: !p.muted })}
                >
                  {p.muted ? t("moderation.unmute") : t("moderation.mute")}
                </button>
                <button
                  className="rounded-full px-2 py-1 text-xs font-bold text-ink-soft hover:bg-white"
                  onClick={() => conn.send("hostKick", { participantId: p.id, ban: false })}
                >
                  {t("moderation.remove")}
                </button>
                <button
                  className="rounded-full px-2 py-1 text-xs font-bold text-danger hover:bg-white"
                  onClick={() =>
                    window.confirm(t("moderation.confirmBan", { name: p.name })) &&
                    conn.send("hostKick", { participantId: p.id, ban: true })
                  }
                >
                  {t("moderation.ban")}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Host-only opt-in to the public Explore dashboard. OFF by default; saving requires a public
 * name and country (separate from the private room title/honoree). Turning it off clears those
 * public fields server-side (see hostDiscovery in party-room.ts) — this form does not control
 * who gets to re-enable it, that permission check happens again on every save.
 */
function DiscoverySettings({
  conn,
  discoverable,
  publicName,
  publicCountry,
  publicIntro,
  acceptWishes,
  showParticipantCount,
}: {
  conn: PartyConnection;
  discoverable: boolean;
  publicName: string;
  publicCountry: string;
  publicIntro: string;
  acceptWishes: boolean;
  showParticipantCount: boolean;
}) {
  const t = useTranslations("party.discovery");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    enabled: discoverable,
    name: publicName,
    country: publicCountry,
    intro: publicIntro,
    acceptWishes,
    showCount: showParticipantCount,
  });
  const invalid = form.enabled && (!form.name.trim() || !form.country);

  const save = () => {
    if (invalid) return;
    conn.send("hostDiscovery", {
      discoverable: form.enabled,
      publicName: form.name.trim() || undefined,
      publicCountry: form.country || undefined,
      publicIntro: form.intro.trim() || undefined,
      acceptWishes: form.acceptWishes,
      showParticipantCount: form.showCount,
    });
  };

  return (
    <div className="rounded-2xl bg-dream-50 p-3" data-testid="discovery-settings">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="discovery-toggle-open"
      >
        <span className="flex items-center gap-2 font-bold text-ink">
          <Globe2 aria-hidden className="size-4" /> {t("title")}
        </span>
        <Badge tone={discoverable ? "mint" : "neutral"}>
          {discoverable ? t("statusOn") : t("statusOff")}
        </Badge>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2.5">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              data-testid="discovery-enable"
            />
            {t("enableLabel")}
          </label>
          <p className="text-xs text-ink-soft">{t("enableHint")}</p>
          {form.enabled && (
            <>
              <Field label={t("nameLabel")}>
                <input
                  type="text"
                  value={form.name}
                  maxLength={80}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-line"
                  data-testid="discovery-name"
                />
              </Field>
              <Field label={t("countryLabel")}>
                <select
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  className="w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-line"
                  data-testid="discovery-country"
                >
                  <option value="">{t("countryPlaceholder")}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {countryName(c.code, "en")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("introLabel")}>
                <textarea
                  value={form.intro}
                  maxLength={280}
                  rows={2}
                  onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))}
                  className="w-full resize-none rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-line"
                  data-testid="discovery-intro"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={form.acceptWishes}
                  onChange={(e) => setForm((f) => ({ ...f, acceptWishes: e.target.checked }))}
                  data-testid="discovery-accept-wishes"
                />
                {t("acceptWishesLabel")}
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={form.showCount}
                  onChange={(e) => setForm((f) => ({ ...f, showCount: e.target.checked }))}
                  data-testid="discovery-show-count"
                />
                {t("showCountLabel")}
              </label>
              {invalid && <p className="text-xs font-semibold text-danger">{t("requiresFields")}</p>}
            </>
          )}
          <Button size="sm" onClick={save} disabled={invalid} data-testid="discovery-save">
            {t("save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
      {label}
      {children}
    </label>
  );
}

function WishesPanel({ conn, isMod, onSent }: { conn: PartyConnection; isMod: boolean; onSent: () => void }) {
  const t = useTranslations("party");
  const [text, setText] = useState("");
  const wishes = conn.view?.wishes ?? [];
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          if (conn.send("wish", { body: text })) {
            setText("");
            onSent();
          }
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t("wish.placeholder")}
          aria-label={t("wish.placeholder")}
          className="rounded-2xl bg-dream-50 p-3 text-ink outline-none ring-1 ring-line focus:ring-4 focus:ring-dream/35"
          data-testid="wish-input"
        />
        <Button type="submit" size="sm" className="self-end" disabled={!text.trim()} data-testid="wish-send">
          <Sparkles aria-hidden /> {t("wish.send")}
        </Button>
      </form>
      {isMod && (
        <section aria-label={t("panels.pending")} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-ink">{t("panels.pending")}</h3>
          {conn.pendingWishes.length === 0 && (
            <p className="text-sm text-ink-muted">{t("wish.pendingEmpty")}</p>
          )}
          {conn.pendingWishes.map((w) => (
            <article key={w.id} className="rounded-2xl bg-gold-100 p-3" data-testid="pending-wish">
              <p className="whitespace-pre-line text-ink">{w.body}</p>
              <p className="mt-1 text-xs font-semibold text-ink-soft">— {w.author}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => conn.send("moderateWish", { wishId: w.id, approve: true })}
                  data-testid="approve-wish"
                >
                  {t("wish.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => conn.send("moderateWish", { wishId: w.id, approve: false })}
                >
                  {t("wish.reject")}
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
      <ul className="flex flex-col gap-2" data-testid="wish-list">
        {wishes.length === 0 && <li className="text-sm text-ink-muted">{t("wish.empty")}</li>}
        {[...wishes].reverse().map((w) => (
          <li key={w.id} className="rounded-2xl bg-pink-100 p-3" data-testid="wish">
            <p className="whitespace-pre-line text-ink">{w.body}</p>
            <p className="mt-1 text-xs font-semibold text-ink-soft">— {w.author}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GiftsPanel({
  conn,
  isHost,
  isMod,
  onSent,
}: {
  conn: PartyConnection;
  isHost: boolean;
  isMod: boolean;
  onSent: () => void;
}) {
  const t = useTranslations("party");
  const tAll = useTranslations();
  const [choice, setChoice] = useState<(typeof GIFT_CATALOG_IDS)[number]>("teddy_bear");
  const [message, setMessage] = useState("");
  const gifts = conn.view?.gifts ?? [];
  const enabled = conn.view?.giftsEnabled ?? true;
  const keyRef = useRef<string>(crypto.randomUUID());
  return (
    <div className="flex flex-col gap-4">
      {enabled ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (conn.send("gift", { catalogId: choice, message, idempotencyKey: keyRef.current })) {
              keyRef.current = crypto.randomUUID();
              setMessage("");
              onSent();
            }
          }}
        >
          <p className="text-sm font-bold text-ink">{t("gift.choose")}</p>
          <div role="radiogroup" aria-label={t("gift.choose")} className="grid grid-cols-3 gap-2">
            {GIFT_CATALOG_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={choice === id}
                onClick={() => setChoice(id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl p-2 text-xs font-bold ring-1",
                  choice === id ? "bg-dream-50 ring-2 ring-dream" : "ring-line hover:bg-dream-50",
                )}
                data-testid={`gift-${id}`}
              >
                <span className="text-2xl" aria-hidden>
                  {GIFTS[id].icon}
                </span>
                {tAll(`gifts.${id}`)}
              </button>
            ))}
          </div>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={400}
            placeholder={t("gift.message")}
            aria-label={t("gift.message")}
            className="h-11 rounded-2xl bg-dream-50 px-3 text-ink outline-none ring-1 ring-line focus:ring-4 focus:ring-dream/35"
          />
          <Button type="submit" size="sm" className="self-end" data-testid="gift-send">
            <GiftIcon aria-hidden /> {t("gift.send")}
          </Button>
        </form>
      ) : (
        <p className="rounded-2xl bg-gold-100 p-3 text-sm text-ink">{t("gift.disabled")}</p>
      )}
      <ul className="flex flex-col gap-2" data-testid="gift-list">
        {gifts.length === 0 && <li className="text-sm text-ink-muted">{t("gift.empty")}</li>}
        {[...gifts].reverse().map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-3 rounded-2xl bg-mint-100 p-3"
            data-testid="gift"
            data-opened={g.opened}
          >
            <span className={cn("text-3xl", !g.opened && "grayscale-[0.2]")} aria-hidden>
              {g.opened ? GIFTS[g.catalogId as keyof typeof GIFTS]?.icon : "🎁"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink">{g.opened ? tAll(`gifts.${g.catalogId}`) : "🎁"}</p>
              <p className="text-xs font-semibold text-ink-soft">{t("gift.from", { name: g.sender })}</p>
              {g.message && <p className="mt-1 text-sm text-ink">{g.message}</p>}
            </div>
            {isHost && !g.opened && (
              <Button
                size="sm"
                onClick={() => conn.send("openGift", { giftId: g.id })}
                data-testid="open-gift"
              >
                {t("gift.open")}
              </Button>
            )}
            {g.opened && <Badge tone="mint">{t("gift.opened")}</Badge>}
            {isMod && (
              <button
                className="text-xs font-bold text-ink-muted hover:text-danger"
                onClick={() => conn.send("removeGift", { giftId: g.id })}
              >
                {t("gift.remove")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InviteSheet({ slug, roomId, onClose }: { slug: string; roomId: string; onClose: () => void }) {
  const t = useTranslations("party");
  const tMeta = useTranslations("meta");
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${slug}/invitations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "link" }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { inviteUrl: string }) => !cancelled && setUrl(b.inviteUrl))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return (
    <Modal title={t("inviteTitle")} onClose={onClose} testId="invite-sheet">
      <p className="mb-4 text-sm text-ink-soft">{t("inviteBody")}</p>
      {url ? (
        <SharePanel
          url={url}
          title={tMeta("title")}
          text={tMeta("description")}
          onShared={(channel) => track("invite_share", { roomId, channel })}
        />
      ) : (
        <p role="status" className="text-sm text-ink-muted">
          {failed ? t("errors.forbidden") : t("inviteCreating")}
        </p>
      )}
    </Modal>
  );
}

function PhotoSheet({
  photo,
  roomId,
  onClose,
}: {
  photo: { url: string; blob: Blob };
  roomId: string;
  onClose: () => void;
}) {
  const t = useTranslations("party.snapshot");
  const file = useMemo(
    () => new File([photo.blob], "happyroom-party.png", { type: "image/png" }),
    [photo.blob],
  );
  const canShareFile = typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  return (
    <Modal title={t("title")} onClose={onClose} testId="photo-sheet">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
      <img src={photo.url} alt={t("title")} className="w-full rounded-2xl" />
      <p className="mt-2 text-xs text-ink-muted">{t("notice")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {canShareFile && (
          <Button
            onClick={async () => {
              try {
                await navigator.share({ files: [file] });
                track("snapshot_shared", { roomId, channel: "native_share" });
              } catch {
                /* cancelled */
              }
            }}
          >
            {t("share")}
          </Button>
        )}
        <Button asChild variant="secondary">
          <a
            href={photo.url}
            download="happyroom-party.png"
            onClick={() => track("snapshot_shared", { roomId, channel: "download" })}
          >
            {t("download")}
          </a>
        </Button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  const tParty = useTranslations("party");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="absolute inset-0 z-30 grid place-items-end bg-ink/40 sm:place-items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-lift sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tParty("close")}
            className="grid size-9 place-items-center rounded-full hover:bg-dream-50"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
