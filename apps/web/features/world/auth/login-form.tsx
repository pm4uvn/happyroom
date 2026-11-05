"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, UserRound } from "lucide-react";
import { Button } from "@happyroom/ui";
import { TextField } from "@/features/create/create-wizard";
import { useHydrated } from "@/hooks/use-hydrated";

/** Sign-in options. Google appears only when the server reports it as configured. */
export function LoginForm({ googleEnabled, next }: { googleEnabled: boolean; next: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  // Controls stay disabled until React has hydrated, so an early tap is never silently ignored.
  const hydrated = useHydrated();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (path: string, body?: object) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        const field = Array.isArray(b.fields) ? b.fields[0]?.code : null;
        setError(r.status === 429 ? "rate_limited" : (field ?? b.error ?? "generic"));
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  const err = error ? (t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")) : null;

  return (
    <div className="flex flex-col gap-5">
      <Button
        size="lg"
        onClick={() => void call("/api/auth/guest")}
        disabled={busy || !hydrated}
        data-testid="login-guest"
      >
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <UserRound aria-hidden />} {t("guest")}
      </Button>
      <p className="-mt-3 text-xs text-ink-muted">{t("guestHint")}</p>
      {googleEnabled && (
        <Button asChild size="lg" variant="secondary">
          <a href="/api/auth/google/start" data-testid="login-google">
            {t("google")}
          </a>
        </Button>
      )}
      <div
        className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-ink-muted"
        aria-hidden
      >
        <span className="h-px flex-1 bg-line" /> {t("or")} <span className="h-px flex-1 bg-line" />
      </div>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void call(mode === "login" ? "/api/auth/login" : "/api/auth/register", { username, password });
        }}
      >
        <TextField
          id="username"
          label={t("username")}
          value={username}
          onChange={(v) => setUsername(v.toLowerCase())}
          maxLength={24}
          autoComplete="username"
          disabled={!hydrated}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-bold text-ink">
            {t("password")}
          </label>
          <input
            id="password"
            type="password"
            disabled={!hydrated}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="h-12 rounded-2xl bg-white px-4 text-ink ring-1 ring-line outline-none focus:ring-4 focus:ring-dream/35"
          />
          {mode === "register" && <p className="text-xs text-ink-muted">{t("passwordHint")}</p>}
        </div>
        {err && (
          <p
            role="alert"
            className="rounded-2xl bg-pink-100 p-3 text-sm font-semibold text-danger"
            data-testid="login-error"
          >
            {err}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          variant="secondary"
          disabled={busy || !username || !password}
          data-testid="login-submit"
        >
          {busy ? t("working") : mode === "login" ? t("signIn") : t("createAccount")}
        </Button>
        <button
          type="button"
          className="text-sm font-semibold text-dream-700 underline-offset-4 hover:underline"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          disabled={!hydrated}
          data-testid="login-toggle"
        >
          {mode === "login" ? t("toRegister") : t("toLogin")}
        </button>
      </form>
    </div>
  );
}
