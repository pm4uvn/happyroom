"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Loader2, PartyPopper } from "lucide-react";
import {
  CAKE_STYLES,
  CAKES,
  createRoomInputSchema,
  DECORATION_PRESETS,
  DECORATIONS,
  THEME_IDS,
  type CakeStyle,
  type CreateRoomInput,
  type DecorationPreset,
  type ThemeId,
} from "@happyroom/shared";
import { Badge, Button, cn } from "@happyroom/ui";
import { ChoiceGrid } from "@/components/choice-grid";
import { SceneFallback } from "@/features/room-scene/scene-fallback";
import { isSupportedLocale } from "@/i18n/locale";
import { track } from "@/lib/analytics/client";
import { browserTimeZone, supportedTimeZones, zonedLocalToUtcIso } from "@/lib/time";
import { CreatedRoomPanel, type CreatedRoom } from "./created-room-panel";

const STEPS = ["event", "names", "theme", "cake", "time", "privacy", "review"] as const;
type Step = (typeof STEPS)[number];

/** Fields validated on each step, so errors appear where the user can fix them. */
const STEP_FIELDS: Record<Step, string[]> = {
  event: ["eventType"],
  names: ["honoreeName", "hostDisplayName"],
  theme: ["themeId"],
  cake: ["cakeStyle", "decoration"],
  time: ["start", "timeZone"],
  privacy: ["privacy", "accessCode"],
  review: [],
};

interface FormState {
  honoreeName: string;
  hostDisplayName: string;
  themeId: ThemeId;
  cakeStyle: CakeStyle;
  decoration: DecorationPreset;
  startMode: "now" | "scheduled";
  localDateTime: string;
  timeZone: string;
  privacy: "invite_link" | "access_code";
  accessCode: string;
}

function defaultLocalDateTime() {
  const d = new Date(Date.now() + 24 * 3600_000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateWizard() {
  const t = useTranslations();
  const locale = useLocale();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => ({
    honoreeName: "",
    hostDisplayName: "",
    themeId: "cozy_twilight",
    cakeStyle: "berry_dream",
    decoration: "balloons_pastel",
    startMode: "now",
    localDateTime: defaultLocalDateTime(),
    timeZone: browserTimeZone(),
    privacy: "invite_link",
    accessCode: "",
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRoom | null>(null);
  const [started, setStarted] = useState(false);
  const timeZones = useMemo(() => supportedTimeZones(), []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    if (!started) {
      setStarted(true);
      track("create_room_start", {}, isSupportedLocale(locale) ? locale : undefined);
    }
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      const { [k === "localDateTime" || k === "startMode" ? "start" : k]: _, ...rest } = e;
      return rest;
    });
  };

  const toInput = (): CreateRoomInput => ({
    eventType: "birthday",
    honoreeName: form.honoreeName,
    hostDisplayName: form.hostDisplayName,
    themeId: form.themeId,
    cakeStyle: form.cakeStyle,
    decoration: form.decoration,
    start:
      form.startMode === "now"
        ? { mode: "now" }
        : { mode: "scheduled", startsAt: zonedLocalToUtcIso(form.localDateTime, form.timeZone) ?? "invalid" },
    timeZone: form.timeZone,
    privacy: form.privacy,
    ...(form.privacy === "access_code" ? { accessCode: form.accessCode } : {}),
    locale: isSupportedLocale(locale) ? locale : "en",
  });

  /** Validate with the same schema the server uses; keep only errors relevant to `fields`. */
  const validate = (fields: string[] | null) => {
    const r = createRoomInputSchema.safeParse(toInput());
    if (r.success) return true;
    const next: Record<string, string> = {};
    for (const issue of r.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (fields && !fields.includes(key)) continue;
      next[key] ??= issue.message === "Invalid input" ? "required" : issue.message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validate(STEP_FIELDS[STEPS[step]!])) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submit = async () => {
    if (!validate(null)) {
      const firstBad = STEPS.findIndex((s) => STEP_FIELDS[s].some((f) => errors[f]));
      if (firstBad >= 0) setStep(firstBad);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toInput()),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setCreated(body as CreatedRoom);
        return;
      }
      if (res.status === 422 && Array.isArray(body.fields)) {
        const next: Record<string, string> = {};
        for (const f of body.fields as { path: string; code: string }[])
          next[f.path.split(".")[0]!] ??= f.code;
        setErrors(next);
        const firstBad = STEPS.findIndex((s) => STEP_FIELDS[s].some((f) => next[f]));
        if (firstBad >= 0) setStep(firstBad);
        return;
      }
      setFormError(res.status === 429 ? "rate_limited" : "generic");
    } catch {
      setFormError("network");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) return <CreatedRoomPanel room={created} />;

  const current = STEPS[step]!;
  const err = (k: string) =>
    errors[k] ? (
      <p role="alert" className="text-sm font-semibold text-danger">
        {t.has(`create.errors.${errors[k]}`) ? t(`create.errors.${errors[k]}`) : t("create.errors.generic")}
      </p>
    ) : null;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (current === "review") void submit();
        else goNext();
      }}
      className="flex flex-col gap-6"
      data-testid="create-wizard"
    >
      {/* Progress */}
      <div>
        <p className="text-sm font-bold text-dream-700">
          {t("create.step", { current: step + 1, total: STEPS.length })} · {t(`create.steps.${current}`)}
        </p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-dream" : "bg-dream-100")}
            />
          ))}
        </div>
      </div>

      <fieldset className="flex min-h-[18rem] flex-col gap-4">
        {current === "event" && (
          <>
            <legend className="mb-2 font-display text-2xl font-extrabold text-ink">
              {t("create.event.label")}
            </legend>
            <ChoiceGrid
              name="event"
              label={t("create.event.label")}
              value="birthday"
              onChange={() => {}}
              choices={[
                { value: "birthday", label: `🎂 ${t("create.event.birthday")}` },
                { value: "later", label: t("create.event.later"), disabled: true },
              ]}
            />
          </>
        )}

        {current === "names" && (
          <>
            <legend className="mb-2 font-display text-2xl font-extrabold text-ink">
              {t("create.steps.names")}
            </legend>
            <TextField
              id="honoree"
              label={t("create.honoree.label")}
              placeholder={t("create.honoree.placeholder")}
              help={t("create.honoree.help")}
              value={form.honoreeName}
              onChange={(v) => set("honoreeName", v)}
              maxLength={60}
              error={err("honoreeName")}
              autoFocus
            />
            <TextField
              id="host"
              label={t("create.host.label")}
              placeholder={t("create.host.placeholder")}
              value={form.hostDisplayName}
              onChange={(v) => set("hostDisplayName", v)}
              maxLength={48}
              error={err("hostDisplayName")}
            />
          </>
        )}

        {current === "theme" && (
          <>
            <legend className="mb-2 font-display text-2xl font-extrabold text-ink">
              {t("create.theme.label")}
            </legend>
            <ChoiceGrid
              name="theme"
              label={t("create.theme.label")}
              value={form.themeId}
              onChange={(v) => set("themeId", v)}
              choices={THEME_IDS.map((id) => ({
                value: id,
                label: t(`themes.${id}.name`),
                description: t(`themes.${id}.description`),
                visual: <SceneFallback themeId={id} className="aspect-[16/10] w-full rounded-xl" />,
              }))}
            />
          </>
        )}

        {current === "cake" && (
          <>
            <legend className="mb-2 font-display text-2xl font-extrabold text-ink">
              {t("create.cake.label")}
            </legend>
            <ChoiceGrid
              name="cake"
              columns={3}
              label={t("create.cake.label")}
              value={form.cakeStyle}
              onChange={(v) => set("cakeStyle", v)}
              choices={CAKE_STYLES.map((id) => ({
                value: id,
                label: t(`cakes.${id}`),
                visual: <Swatches colors={[...CAKES[id].tiers, CAKES[id].frosting]} />,
              }))}
            />
            <h3 className="mt-2 font-bold text-ink">{t("create.decoration.label")}</h3>
            <ChoiceGrid
              name="decoration"
              columns={3}
              label={t("create.decoration.label")}
              value={form.decoration}
              onChange={(v) => set("decoration", v)}
              choices={DECORATION_PRESETS.map((id) => ({
                value: id,
                label: t(`decorations.${id}`),
                visual: <Swatches colors={DECORATIONS[id].colors} />,
              }))}
            />
          </>
        )}

        {current === "time" && (
          <>
            <legend className="mb-2 font-display text-2xl font-extrabold text-ink">
              {t("create.time.label")}
            </legend>
            <ChoiceGrid
              name="start"
              label={t("create.time.label")}
              value={form.startMode}
              onChange={(v) => set("startMode", v)}
              choices={[
                { value: "now", label: `⚡ ${t("create.time.now")}` },
                { value: "scheduled", label: `📅 ${t("create.time.scheduled")}` },
              ]}
            />
            {form.startMode === "scheduled" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
                  {t("create.time.dateTime")}
                  <input
                    type="datetime-local"
                    value={form.localDateTime}
                    onChange={(e) => set("localDateTime", e.target.value)}
                    className="h-12 rounded-2xl bg-white px-4 font-normal ring-1 ring-line outline-none focus:ring-4 focus:ring-dream/35"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-bold text-ink">
                  {t("create.time.timeZone")}
                  <select
                    value={form.timeZone}
                    onChange={(e) => set("timeZone", e.target.value)}
                    className="h-12 rounded-2xl bg-white px-4 font-normal ring-1 ring-line outline-none focus:ring-4 focus:ring-dream/35"
                  >
                    {timeZones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {err("start")}
            {err("timeZone")}
          </>
        )}

        {current === "privacy" && (
          <>
            <legend className="mb-2 font-display text-2xl font-extrabold text-ink">
              {t("create.privacy.label")}
            </legend>
            <ChoiceGrid
              name="privacy"
              label={t("create.privacy.label")}
              value={form.privacy}
              onChange={(v) => set("privacy", v)}
              choices={[
                {
                  value: "invite_link",
                  label: `🔗 ${t("create.privacy.inviteLink")}`,
                  description: t("create.privacy.inviteLinkHelp"),
                },
                {
                  value: "access_code",
                  label: `🔐 ${t("create.privacy.accessCode")}`,
                  description: t("create.privacy.accessCodeHelp"),
                },
              ]}
            />
            {form.privacy === "access_code" && (
              <TextField
                id="access-code"
                label={t("create.privacy.codeLabel")}
                placeholder={t("create.privacy.codePlaceholder")}
                value={form.accessCode}
                onChange={(v) => set("accessCode", v.toUpperCase())}
                maxLength={12}
                error={err("accessCode")}
                autoComplete="off"
              />
            )}
          </>
        )}

        {current === "review" && (
          <>
            <legend className="mb-2 font-display text-2xl font-extrabold text-ink">
              {t("create.review.title")}
            </legend>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-2xl bg-dream-50 p-4 text-sm">
              <dt className="font-semibold text-ink-soft">{t("create.review.honoree")}</dt>
              <dd className="font-bold text-ink">{form.honoreeName}</dd>
              <dt className="font-semibold text-ink-soft">{t("create.review.host")}</dt>
              <dd className="font-bold text-ink">{form.hostDisplayName}</dd>
              <dt className="font-semibold text-ink-soft">{t("create.review.theme")}</dt>
              <dd className="font-bold text-ink">{t(`themes.${form.themeId}.name`)}</dd>
              <dt className="font-semibold text-ink-soft">{t("create.review.cake")}</dt>
              <dd className="font-bold text-ink">
                {t(`cakes.${form.cakeStyle}`)} · {t(`decorations.${form.decoration}`)}
              </dd>
              <dt className="font-semibold text-ink-soft">{t("create.review.time")}</dt>
              <dd className="font-bold text-ink">
                {form.startMode === "now"
                  ? t("create.review.now")
                  : `${form.localDateTime.replace("T", " ")} (${form.timeZone})`}
              </dd>
              <dt className="font-semibold text-ink-soft">{t("create.review.privacy")}</dt>
              <dd className="font-bold text-ink">
                {form.privacy === "invite_link"
                  ? t("create.privacy.inviteLink")
                  : t("create.privacy.accessCode")}
              </dd>
            </dl>
            <p className="flex gap-2 rounded-2xl bg-gold-100 p-4 text-sm text-ink">
              <span aria-hidden>🔑</span>
              {t("create.lostSession")}
            </p>
          </>
        )}
      </fieldset>

      {formError && (
        <p role="alert" className="rounded-2xl bg-pink-100 p-3 text-sm font-semibold text-danger">
          {t(`create.errors.${formError}`)}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
        >
          <ArrowLeft aria-hidden /> {t("create.back")}
        </Button>
        {current === "review" ? (
          <Button type="submit" size="lg" disabled={submitting} data-testid="create-submit">
            {submitting ? <Loader2 aria-hidden className="animate-spin" /> : <PartyPopper aria-hidden />}
            {submitting ? t("create.submitting") : t("create.submit")}
          </Button>
        ) : (
          <Button type="submit" size="lg" data-testid="create-next">
            {t("create.next")} <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
      {step === 0 && (
        <Badge tone="mint" className="self-start">
          {t("create.subtitle")}
        </Badge>
      )}
    </form>
  );
}

function Swatches({ colors }: { colors: readonly string[] }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {colors.map((c, i) => (
        <span
          key={i}
          className="size-6 rounded-full ring-2 ring-white shadow-soft"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  help,
  error,
  maxLength,
  autoFocus,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  error?: React.ReactNode;
  maxLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-ink">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={help ? `${id}-help` : undefined}
        className="h-12 rounded-2xl bg-white px-4 text-ink ring-1 ring-line outline-none placeholder:text-ink-muted focus:ring-4 focus:ring-dream/35 aria-[invalid=true]:ring-danger"
      />
      {help && (
        <p id={`${id}-help`} className="text-xs text-ink-muted">
          {help}
        </p>
      )}
      {error}
    </div>
  );
}
