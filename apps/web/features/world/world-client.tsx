"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Flag, LogOut, Map as MapIcon, MessageCircle, Settings, ShieldOff, Smile, X } from "lucide-react";
import { REPORT_REASONS } from "@happyroom/shared";
import { buildZoneCollision, isWalkable, WORLD_EMOTES, type ZoneDefinition } from "@happyroom/world";
import { EMOTES } from "@happyroom/shared";
import { Badge, Button, cn } from "@happyroom/ui";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { detectQualityTier, probeGpu } from "@/features/room-scene/capabilities";
import { AvatarTag, createLabelRegistry, Label, LabelLayer } from "@/features/room-scene/labels";
import type { Pose } from "./engine/character-controller";
import { WorldEventBus, type ChatMessage, type PortalTarget } from "./engine/event-bus";
import { bindWorldKeyboard, createWorldInput, type WorldInput } from "./engine/input";
import type { Focus } from "./engine/interaction";
import { ZoneConnection } from "./engine/zone-connection";
import { ZoneRegistry, type ZoneSummary } from "./engine/zone-registry";
import { WorldScene, type CameraState, type PerfStats } from "./scene/world-scene";

export interface WorldProfile {
  id: string;
  displayName: string;
  avatar: string;
  ageBand: "under13" | "teen" | "adult";
  chatEnabled: boolean;
}

type Quality = "auto" | "high" | "low";
const SETTINGS_KEY = "hr_world_settings";
interface Settings {
  quality: Quality;
  showStats: boolean;
  moveButtons: boolean;
  sprintToggle: boolean;
}
function loadSettings(): Settings {
  const d: Settings = { quality: "auto", showStats: false, moveButtons: false, sprintToggle: false };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return d;
  }
}

/**
 * Start the camera behind the player unless that spot is inside geometry (e.g. just walked out of
 * the Birthday House): then start in front, so the player sees the building they came from.
 */
function initialCameraYaw(zone: ZoneDefinition, s: { x: number; z: number; rotY: number }): number {
  const zc = buildZoneCollision(zone);
  const d = 7;
  const behind = { x: s.x - Math.sin(s.rotY) * d, z: s.z - Math.cos(s.rotY) * d };
  return isWalkable(behind, zc, 1) ? s.rotY + Math.PI : s.rotY;
}

const zoneName = (z: { displayName: Record<string, string> } | null, locale: string) =>
  z ? (z.displayName[locale] ?? z.displayName.en ?? "") : "";

/** WorldManager: owns the engine systems for this page and renders the scene + HUD. */
export function WorldClient({
  profile,
  initialZone,
  initialSpawn,
}: {
  profile: WorldProfile;
  initialZone: string;
  initialSpawn?: string;
}) {
  const t = useTranslations("world");
  const tAll = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [bus] = useState(() => new WorldEventBus());
  const [registry] = useState(() => new ZoneRegistry());
  const [conn] = useState(() => new ZoneConnection(bus, registry));
  useSyncExternalStore(conn.subscribe, conn.getVersion, conn.getVersion);

  const inputRef = useRef<WorldInput>(createWorldInput());
  const poseRef = useRef<Pose>({ x: 0, z: 0, rotY: 0, anim: "idle" });
  const cameraRef = useRef<CameraState>({ yaw: 0, pitch: 0.6, distance: 9 });
  const [registryLabels] = useState(createLabelRegistry);
  const [zone, setZone] = useState<ZoneDefinition | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "transition" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [houseOpen, setHouseOpen] = useState(false);
  const [panel, setPanel] = useState<"chat" | "places" | "settings" | "emotes" | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [settings, setSettings] = useState<Settings>(() =>
    typeof window === "undefined"
      ? { quality: "auto", showStats: false, moveButtons: false, sprintToggle: false }
      : loadSettings(),
  );
  const [stats, setStats] = useState<PerfStats | null>(null);
  const [coarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
  );
  const [autoQuality] = useState<"high" | "low">(() =>
    typeof window === "undefined" ? "low" : detectQualityTier(probeGpu()),
  );
  const quality = settings.quality === "auto" ? autoQuality : settings.quality;
  const [zones, setZones] = useState<ZoneSummary[]>([]);
  const [myEmote, setMyEmote] = useState({ emote: "", seq: 0 });

  const toast = useCallback((text: string) => {
    const id = Math.random();
    setToasts((x) => [...x.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 3500);
  }, []);

  const enterZone = useCallback(
    async (zoneId: string, spawnId?: string, transition = false) => {
      setPhase(transition ? "transition" : "loading");
      setErrorCode(null);
      setFocus(null);
      try {
        // false = superseded by a newer enter (StrictMode remount / fast travel): nothing to do.
        if (!(await conn.enter(zoneId, spawnId))) return;
        const z = conn.zone!;
        const s = conn.spawn ?? z.spawnPoints.find((p) => p.default)!;
        Object.assign(poseRef.current, { x: s.x, z: s.z, rotY: s.rotY, anim: "idle" });
        cameraRef.current.yaw = initialCameraYaw(z, s);
        setZone(z);
        setPhase("ready");
        bus.emit("zone:ready", { zoneId });
        const url = new URL(window.location.href);
        url.searchParams.set("zone", zoneId);
        url.searchParams.delete("spawn");
        window.history.replaceState(null, "", url);
      } catch (e) {
        setErrorCode((e as { code?: string }).code ?? "enter_failed");
        setPhase("error");
      }
    },
    [bus, conn],
  );

  useEffect(() => {
    const offKeys = bindWorldKeyboard(inputRef.current);
    const offs = [
      bus.on("zone:loading", (e) => setProgress(e.progress)),
      bus.on("portal:granted", ({ target }: { target: PortalTarget }) => {
        if (target.kind === "birthday_house") setHouseOpen(true);
        else void enterZone(target.zoneId, target.spawnId, true);
      }),
      bus.on("notice", (n) => toast(tAll.has(n.key) ? tAll(n.key) : t("errors.invalid_payload"))),
    ];
    queueMicrotask(() => void enterZone(initialZone, initialSpawn));
    void registry.zones().then(setZones, () => {});
    return () => {
      offKeys();
      offs.forEach((o) => o());
      void conn.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interact = useCallback(() => {
    if (!focus) return;
    if (focus.kind === "portal") conn.send("usePortal", { portalId: focus.id });
    else toast(t(focus.messageKey.replace(/^world\./, "") as "message.fountain"));
  }, [focus, conn, toast, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.code === "KeyE") interact();
      if (e.code === "Escape") {
        setPanel(null);
        setHouseOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interact]);

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    inputRef.current.sprintToggle = next.sprintToggle;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const goBirthday = async (path: "/create" | "/join") => {
    try {
      sessionStorage.setItem("hr_from_world", "1");
    } catch {
      /* ignore */
    }
    await conn.leave();
    router.push(path);
  };

  const sendEmote = (emote: (typeof WORLD_EMOTES)[number]) => {
    if (conn.send("emote", { emote })) setMyEmote((m) => ({ emote, seq: m.seq + 1 }));
    window.setTimeout(() => setMyEmote((m) => (m.emote === emote ? { ...m, emote: "" } : m)), 2500);
  };

  const signOut = async () => {
    await conn.leave();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  };

  const replaced = conn.status === "disconnected" && conn.endedCode === 4001;
  const remoteIds = useMemo(
    () => conn.players.filter((p) => p.id !== conn.selfId).map((p) => p.id),
    [conn.players, conn.selfId],
  );
  const online = conn.players.filter((p) => p.connected).length;
  const zn = zoneName(zone, locale);

  return (
    <div
      className="relative h-dvh overflow-hidden bg-ink"
      data-testid="world"
      data-zone={zone?.zoneId ?? ""}
      data-phase={phase}
    >
      {zone && (phase === "ready" || phase === "transition") && (
        <div className="absolute inset-0">
          <WorldScene
            key={`${zone.zoneId}:${conn.instanceId}`}
            zone={zone}
            conn={conn}
            selfAvatar={profile.avatar}
            inputRef={inputRef}
            poseRef={poseRef}
            cameraRef={cameraRef}
            registry={registryLabels}
            quality={quality}
            reducedMotion={reducedMotion}
            onFocus={setFocus}
            onStats={setStats}
            remoteIds={remoteIds}
            selfEmote={myEmote}
          />
          <LabelLayer>
            {conn.players.map((p) => (
              <Label key={p.id} id={p.id} registry={registryLabels}>
                <AvatarTag
                  name={p.id === conn.selfId ? t("you") : p.name}
                  bubble={
                    (p.id === conn.selfId ? myEmote.emote : p.emote)
                      ? EMOTES[(p.id === conn.selfId ? myEmote.emote : p.emote) as keyof typeof EMOTES]?.icon
                      : null
                  }
                />
              </Label>
            ))}
          </LabelLayer>
        </div>
      )}

      {/* Loading / transition screen */}
      {(phase === "loading" || phase === "transition" || phase === "error" || replaced) && (
        <div
          className={cn(
            "absolute inset-0 z-30 grid place-items-center bg-gradient-to-br from-dream-100 via-pink-100 to-mint-100",
            phase === "transition" && "bg-white/85 backdrop-blur",
          )}
          data-testid="world-loading"
        >
          <div className="flex w-72 flex-col items-center gap-4 text-center">
            <span className="animate-float text-5xl" aria-hidden>
              {phase === "error" ? "🎈" : "🌍"}
            </span>
            <p role="status" className="font-display text-xl font-extrabold text-ink">
              {replaced
                ? t("errors.replaced")
                : phase === "error"
                  ? t(`errors.${errorCode ?? "enter_failed"}` as "errors.enter_failed")
                  : phase === "transition"
                    ? t("travelling")
                    : t("loading")}
            </p>
            {phase !== "error" && !replaced ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-white" aria-hidden>
                <div
                  className="h-full rounded-full bg-dream transition-all duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => void enterZone(zone?.zoneId ?? initialZone)}>{t("retry")}</Button>
                {(errorCode === "unauthenticated" || errorCode === "profile_incomplete") && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      router.push(errorCode === "unauthenticated" ? "/login" : "/world/character")
                    }
                  >
                    OK
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "ready" && zone && (
        <>
          {/* Top bar */}
          <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="pointer-events-auto rounded-2xl bg-white/90 px-4 py-2 shadow-soft backdrop-blur">
              <h1
                className="font-display text-lg font-extrabold leading-tight text-ink"
                data-testid="zone-name"
              >
                {zn}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-soft">
                <span data-testid="world-online" data-count={online}>
                  {t("online", { count: online })}
                </span>
                <span
                  className="inline-flex items-center gap-1"
                  data-testid="world-status"
                  data-status={conn.status}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      conn.status === "connected"
                        ? "bg-mint"
                        : conn.status === "reconnecting"
                          ? "bg-gold"
                          : "bg-danger",
                    )}
                    aria-hidden
                  />
                  {t(`status.${conn.status}`)}
                </span>
              </div>
            </div>
            <div className="pointer-events-auto flex gap-2">
              <IconButton
                label={t("places")}
                onClick={() => setPanel(panel === "places" ? null : "places")}
                testId="open-places"
              >
                <MapIcon />
              </IconButton>
              <IconButton
                label={t("settings")}
                onClick={() => setPanel(panel === "settings" ? null : "settings")}
                testId="open-settings"
              >
                <Settings />
              </IconButton>
              <IconButton label={t("signOut")} onClick={signOut} testId="sign-out">
                <LogOut />
              </IconButton>
            </div>
          </header>

          <MiniMap zone={zone} conn={conn} poseRef={poseRef} label={t("minimap", { zone: zn })} />
          <PresenceList conn={conn} poseRef={poseRef} youLabel={t("you")} title={t("here")} />

          {settings.showStats && stats && (
            <p
              className="absolute left-3 top-28 z-10 rounded-full bg-ink/80 px-3 py-1 font-mono text-xs text-white"
              data-testid="perf-stats"
              data-fps={stats.fps}
              data-calls={stats.drawCalls}
            >
              {t("stats", {
                fps: stats.fps,
                calls: stats.drawCalls,
                memory: stats.memoryMB !== null ? `${stats.memoryMB} MB` : "—",
              })}{" "}
              · {quality}
            </p>
          )}

          {/* Toasts */}
          <div
            className="pointer-events-none absolute inset-x-0 top-28 z-20 flex flex-col items-center gap-2 px-4"
            role="status"
            aria-live="polite"
          >
            {toasts.map((x) => (
              <p
                key={x.id}
                className="animate-pop-in rounded-full bg-ink/85 px-4 py-1.5 text-center text-sm font-semibold text-white"
              >
                {x.text}
              </p>
            ))}
          </div>

          {/* Interaction prompt */}
          {focus && !houseOpen && (
            <div className="absolute inset-x-0 bottom-40 z-10 flex justify-center px-4">
              <Button
                size="lg"
                variant="party"
                onClick={interact}
                className="animate-pop-in shadow-lift"
                data-testid="interact"
                data-focus={focus.id}
              >
                <kbd className="grid size-6 place-items-center rounded-md bg-white/80 text-xs font-bold text-ink">
                  {t("interactKey")}
                </kbd>
                {tAll(focus.promptKey)}
              </Button>
            </div>
          )}

          {/* Movement: joystick (touch) + optional accessible buttons */}
          {coarse && <WorldJoystick inputRef={inputRef} label={t("joystick")} />}
          {settings.moveButtons && <MoveButtons inputRef={inputRef} />}

          {/* Bottom bar */}
          <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto flex items-center gap-1 rounded-3xl bg-white/90 p-1.5 shadow-lift backdrop-blur">
              <IconButton
                label={t("emotes")}
                onClick={() => setPanel(panel === "emotes" ? null : "emotes")}
                testId="open-emotes"
              >
                <Smile />
              </IconButton>
              <IconButton
                label={t("chat.show")}
                onClick={() => setPanel(panel === "chat" ? null : "chat")}
                testId="open-chat"
                badge={panel !== "chat" ? conn.chat.length : 0}
              >
                <MessageCircle />
              </IconButton>
            </div>
            <p className="hidden text-xs font-semibold text-white/85 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)] sm:block">
              {coarse ? t("controlsMobile") : t("controlsDesktop")}
            </p>
          </nav>

          {panel === "emotes" && (
            <div
              className="absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-3xl bg-white p-2 shadow-lift"
              role="group"
              aria-label={t("emotes")}
            >
              {WORLD_EMOTES.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => sendEmote(e)}
                  aria-label={tAll(`emotes.${e}`)}
                  title={tAll(`emotes.${e}`)}
                  className="grid size-11 place-items-center rounded-full text-2xl hover:bg-dream-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35"
                  data-testid={`world-emote-${e}`}
                >
                  <span aria-hidden>{EMOTES[e].icon}</span>
                </button>
              ))}
            </div>
          )}

          {panel === "chat" && (
            <ChatPanel
              conn={conn}
              profile={profile}
              zoneId={zone.zoneId}
              onClose={() => setPanel(null)}
              toast={toast}
            />
          )}
          {panel === "places" && (
            <SidePanel title={t("places")} onClose={() => setPanel(null)} testId="places-panel">
              <ul className="flex flex-col gap-2">
                {zones.map((z) => (
                  <li
                    key={z.zoneId}
                    className="flex items-center justify-between rounded-2xl bg-dream-50 px-3 py-2"
                  >
                    <span className="font-semibold text-ink">{zoneName(z, locale)}</span>
                    {z.zoneId === zone.zoneId ? (
                      <Badge tone="mint">{t("current")}</Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => (setPanel(null), void enterZone(z.zoneId, undefined, true))}
                        data-testid={`travel-${z.zoneId}`}
                      >
                        {t("travel")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </SidePanel>
          )}
          {panel === "settings" && (
            <SidePanel title={t("settings")} onClose={() => setPanel(null)} testId="settings-panel">
              <label className="flex flex-col gap-1 text-sm font-bold text-ink">
                {t("quality")}
                <select
                  value={settings.quality}
                  onChange={(e) => updateSettings({ quality: e.target.value as Quality })}
                  className="h-10 rounded-xl bg-dream-50 px-3 font-normal"
                  data-testid="quality-select"
                >
                  <option value="auto">{t("qualityAuto")}</option>
                  <option value="high">{t("qualityHigh")}</option>
                  <option value="low">{t("qualityLow")}</option>
                </select>
              </label>
              {(
                [
                  ["showStats", t("showStats")],
                  ["moveButtons", t("moveButtons")],
                  ["sprintToggle", t("sprintToggle")],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    className="size-5 accent-dream"
                    checked={settings[k]}
                    onChange={(e) => updateSettings({ [k]: e.target.checked })}
                    data-testid={`setting-${k}`}
                  />
                  {label}
                </label>
              ))}
              <p className="mt-4 text-xs text-ink-muted">
                {t("here")}: {zn} · {conn.instanceId.slice(0, 8)}
              </p>
            </SidePanel>
          )}

          {houseOpen && (
            <div
              className="absolute inset-0 z-30 grid place-items-end bg-ink/40 sm:place-items-center"
              onClick={() => setHouseOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="house-title"
                className="w-full rounded-t-3xl bg-white p-6 shadow-lift sm:max-w-md sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
                data-testid="house-menu"
              >
                <h2 id="house-title" className="font-display text-2xl font-extrabold text-ink">
                  {t("house.title")}
                </h2>
                <p className="mt-2 text-sm text-ink-soft">{t("house.body")}</p>
                <div className="mt-5 flex flex-col gap-2">
                  <Button size="lg" onClick={() => void goBirthday("/create")} data-testid="house-create">
                    {t("house.create")}
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => void goBirthday("/join")}
                    data-testid="house-join"
                  >
                    {t("house.join")}
                  </Button>
                  <Button variant="ghost" onClick={() => setHouseOpen(false)} data-testid="house-back">
                    {t("house.back")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  testId,
  badge = 0,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative grid size-11 place-items-center rounded-full bg-white/90 text-ink shadow-soft backdrop-blur hover:bg-dream-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35 [&_svg]:size-5"
      data-testid={testId}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-pink-600 text-[10px] font-bold text-white">
          {Math.min(badge, 9)}
        </span>
      )}
    </button>
  );
}

function SidePanel({
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
  const t = useTranslations("world");
  return (
    <aside
      className="absolute inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-lift sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-24 sm:w-80 sm:rounded-3xl"
      aria-label={title}
      data-testid={testId}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="grid size-9 place-items-center rounded-full hover:bg-dream-50"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      {children}
    </aside>
  );
}

/** Mini-map: static zone layout from data + live player dots updated every frame (no re-render). */
function MiniMap({
  zone,
  conn,
  poseRef,
  label,
}: {
  zone: ZoneDefinition;
  conn: ZoneConnection;
  poseRef: React.RefObject<Pose>;
  label: string;
}) {
  const b = zone.bounds;
  const w = b.maxX - b.minX;
  const h = b.maxZ - b.minZ;
  const dots = useRef<SVGGElement>(null);
  const me = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const g = dots.current;
      if (g) {
        const others = [...conn.live.values()].filter((p) => p.id !== conn.selfId && p.connected);
        while (g.childNodes.length < others.length)
          g.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "circle"));
        while (g.childNodes.length > others.length) g.removeChild(g.lastChild!);
        others.forEach((p, i) => {
          const c = g.childNodes[i] as SVGCircleElement;
          c.setAttribute("cx", String(p.x));
          c.setAttribute("cy", String(p.z));
          c.setAttribute("r", "0.7");
          c.setAttribute("fill", "#F9A6BA");
        });
      }
      me.current?.setAttribute("cx", String(poseRef.current.x));
      me.current?.setAttribute("cy", String(poseRef.current.z));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [conn, poseRef]);
  return (
    <figure
      className="absolute right-3 top-[4.75rem] z-10 hidden size-36 overflow-hidden rounded-2xl bg-white/85 p-1.5 shadow-soft ring-1 ring-white backdrop-blur sm:block"
      data-testid="minimap"
    >
      <svg viewBox={`${b.minX} ${b.minZ} ${w} ${h}`} className="size-full" role="img" aria-label={label}>
        <rect x={b.minX} y={b.minZ} width={w} height={h} fill="#A8DDA8" />
        {zone.terrain.map((tr) =>
          tr.shape.kind === "circle" ? (
            <circle
              key={tr.id}
              cx={tr.shape.center[0]}
              cy={tr.shape.center[1]}
              r={tr.shape.radius}
              fill={tr.material === "water" ? "#8EC5FF" : "#F1ECF9"}
            />
          ) : tr.id !== "ground_grass" && tr.id !== "lawn" ? (
            <rect
              key={tr.id}
              x={tr.shape.rect.minX}
              y={tr.shape.rect.minZ}
              width={tr.shape.rect.maxX - tr.shape.rect.minX}
              height={tr.shape.rect.maxZ - tr.shape.rect.minZ}
              fill="#EADBC8"
            />
          ) : null,
        )}
        {zone.objects
          .filter((o) => o.collider?.kind === "box" && o.type !== "bench" && o.type !== "flowerbed")
          .map((o) => {
            const c = o.collider as { width: number; depth: number };
            return (
              <rect
                key={o.id}
                x={o.position[0] - c.width / 2}
                y={o.position[2] - c.depth / 2}
                width={c.width}
                height={c.depth}
                fill={o.type === "birthday_house" ? "#9178E8" : "#5CB389"}
                rx={0.5}
              />
            );
          })}
        {zone.portals.map((p) => (
          <circle key={p.id} cx={p.position[0]} cy={p.position[1]} r={p.radius * 0.7} fill="#F5C870" />
        ))}
        <g ref={dots} />
        <circle ref={me} r={0.9} fill="#182238" stroke="#fff" strokeWidth={0.3} />
      </svg>
    </figure>
  );
}

/**
 * Accessible presence list (visually hidden): who is here and how far away, refreshed twice a
 * second from authoritative state. Also used by end-to-end tests to observe real positions.
 */
function PresenceList({
  conn,
  poseRef,
  youLabel,
  title,
}: {
  conn: ZoneConnection;
  poseRef: React.RefObject<Pose>;
  youLabel: string;
  title: string;
}) {
  const [rows, setRows] = useState<{ id: string; name: string; x: number; z: number; self: boolean }[]>([]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const me = poseRef.current;
      setRows([
        { id: conn.selfId, name: youLabel, x: me.x, z: me.z, self: true },
        ...[...conn.live.values()]
          .filter((p) => p.id !== conn.selfId && p.connected)
          .map((p) => ({ id: p.id, name: p.name, x: p.x, z: p.z, self: false })),
      ]);
    }, 500);
    return () => window.clearInterval(id);
  }, [conn, poseRef, youLabel]);
  const me = rows.find((r) => r.self);
  return (
    <ul className="sr-only" aria-label={title} data-testid="presence">
      {rows.map((r) => (
        <li
          key={r.id}
          data-testid="presence-player"
          data-name={r.name}
          data-self={r.self}
          data-x={r.x.toFixed(2)}
          data-z={r.z.toFixed(2)}
        >
          {r.name}
          {me && !r.self ? ` — ${Math.round(Math.hypot(r.x - me.x, r.z - me.z))} m` : ""}
        </li>
      ))}
    </ul>
  );
}

function WorldJoystick({ inputRef, label }: { inputRef: React.RefObject<WorldInput>; label: string }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 48;
  const set = (cx: number, cy: number) => {
    const r = base.current!.getBoundingClientRect();
    let dx = cx - (r.left + r.width / 2);
    let dy = cy - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    inputRef.current.stick.x = dx / R;
    inputRef.current.stick.y = -dy / R;
  };
  const reset = () => {
    setKnob({ x: 0, y: 0 });
    inputRef.current.stick.x = 0;
    inputRef.current.stick.y = 0;
  };
  return (
    <div className="absolute bottom-24 left-4 z-10 pb-[env(safe-area-inset-bottom)]">
      <div
        ref={base}
        role="application"
        aria-label={label}
        className="relative grid size-32 touch-none select-none place-items-center rounded-full bg-white/40 ring-1 ring-white/70 backdrop-blur"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          set(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => e.buttons && set(e.clientX, e.clientY)}
        onPointerUp={reset}
        onPointerCancel={reset}
        data-testid="world-joystick"
      >
        <span
          className="size-14 rounded-full bg-white shadow-lift ring-2 ring-dream/40"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

/** Accessible alternative: large hold-to-move buttons (pointer, or keyboard Space/Enter held). */
function HoldButton({
  inputRef,
  x,
  y,
  label,
  children,
}: {
  inputRef: React.RefObject<WorldInput>;
  x: number;
  y: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-14 place-items-center rounded-2xl bg-white/90 text-xl font-bold text-ink shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dream/35"
      onPointerDown={() => Object.assign(inputRef.current.buttons, { x, y })}
      onPointerUp={() => Object.assign(inputRef.current.buttons, { x: 0, y: 0 })}
      onPointerLeave={() => Object.assign(inputRef.current.buttons, { x: 0, y: 0 })}
      onKeyDown={(e) =>
        (e.key === " " || e.key === "Enter") && Object.assign(inputRef.current.buttons, { x, y })
      }
      onKeyUp={() => Object.assign(inputRef.current.buttons, { x: 0, y: 0 })}
    >
      {children}
    </button>
  );
}

function MoveButtons({ inputRef }: { inputRef: React.RefObject<WorldInput> }) {
  const t = useTranslations("world.move");
  return (
    <div className="absolute bottom-24 right-4 z-10 grid grid-cols-3 gap-1" data-testid="move-buttons">
      <span />
      <HoldButton inputRef={inputRef} x={0} y={1} label={t("up")}>
        ↑
      </HoldButton>
      <span />
      <HoldButton inputRef={inputRef} x={-1} y={0} label={t("left")}>
        ←
      </HoldButton>
      <HoldButton inputRef={inputRef} x={0} y={-1} label={t("down")}>
        ↓
      </HoldButton>
      <HoldButton inputRef={inputRef} x={1} y={0} label={t("right")}>
        →
      </HoldButton>
    </div>
  );
}

function ChatPanel({
  conn,
  profile,
  zoneId,
  onClose,
  toast,
}: {
  conn: ZoneConnection;
  profile: WorldProfile;
  zoneId: string;
  onClose: () => void;
  toast: (s: string) => void;
}) {
  const t = useTranslations("world.chat");
  const tw = useTranslations("world");
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("harassment");
  const canChat = profile.ageBand !== "under13" && profile.chatEnabled;

  const block = async (m: ChatMessage) => {
    const r = await fetch("/api/world/block", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetId: m.from, blocked: true }),
    });
    if (r.ok) {
      setHidden((h) => new Set(h).add(m.from));
      conn.refreshBlocks();
      toast(t("blocked", { name: m.name }));
    }
  };
  const report = async () => {
    if (!reporting) return;
    const r = await fetch("/api/world/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetId: reporting.from, zoneId, reason, chatText: reporting.text }),
    });
    if (r.ok) toast(t("reported"));
    setReporting(null);
  };

  return (
    <SidePanel title={t("title")} onClose={onClose} testId="chat-panel">
      <ul
        className="flex max-h-72 flex-col gap-1.5 overflow-y-auto"
        aria-live="polite"
        data-testid="chat-log"
      >
        {conn.chat.filter((m) => !hidden.has(m.from)).length === 0 && (
          <li className="text-sm text-ink-muted">{t("empty")}</li>
        )}
        {conn.chat
          .filter((m) => !hidden.has(m.from))
          .map((m) => (
            <li
              key={m.id}
              className="group rounded-2xl bg-dream-50 px-3 py-2 text-sm"
              data-testid="chat-message"
            >
              <span className="font-bold text-ink">{m.from === conn.selfId ? tw("you") : m.name}: </span>
              <span className="text-ink">{m.text}</span>
              {m.from !== conn.selfId && (
                <span className="ml-2 inline-flex gap-1 opacity-70 group-hover:opacity-100">
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 text-xs font-bold text-ink-soft hover:text-danger"
                    onClick={() => void block(m)}
                    data-testid="chat-block"
                  >
                    <ShieldOff className="size-3" aria-hidden /> {t("block")}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-0.5 text-xs font-bold text-ink-soft hover:text-danger"
                    onClick={() => setReporting(m)}
                    data-testid="chat-report"
                  >
                    <Flag className="size-3" aria-hidden /> {t("report")}
                  </button>
                </span>
              )}
            </li>
          ))}
      </ul>
      {reporting && (
        <div className="mt-3 rounded-2xl bg-pink-100 p-3" data-testid="report-form">
          <p className="text-sm font-bold text-ink">{t("reportTitle", { name: reporting.name })}</p>
          <label className="mt-2 flex flex-col gap-1 text-xs font-bold text-ink">
            {t("reportReason")}
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="h-9 rounded-xl bg-white px-2 font-normal"
            >
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {tw(`reasons.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" className="mt-2" onClick={() => void report()} data-testid="report-send">
            {t("reportSend")}
          </Button>
        </div>
      )}
      {canChat ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && conn.send("chat", { text: text.slice(0, 400) })) setText("");
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="h-10 min-w-0 flex-1 rounded-xl bg-dream-50 px-3 text-sm outline-none ring-1 ring-line focus:ring-4 focus:ring-dream/35"
            data-testid="chat-input"
          />
          <Button type="submit" size="sm" data-testid="chat-send">
            {t("send")}
          </Button>
        </form>
      ) : (
        <p className="mt-3 rounded-2xl bg-gold-100 p-3 text-xs text-ink">
          {profile.ageBand === "under13" ? t("kidsOff") : t("off")}
        </p>
      )}
    </SidePanel>
  );
}
