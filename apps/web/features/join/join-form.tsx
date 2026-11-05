"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@happyroom/ui";
import { parseInviteInput } from "./parse-invite";

export function JoinForm() {
  const t = useTranslations("join");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = parseInviteInput(value);
        if (!parsed) return setError(true);
        router.push(`/r/${parsed.slug}${parsed.token ? `?i=${encodeURIComponent(parsed.token)}` : ""}`);
      }}
    >
      <label htmlFor="invite" className="text-sm font-bold text-ink">
        {t("label")}
      </label>
      <input
        id="invite"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(false);
        }}
        placeholder={t("placeholder")}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={error || undefined}
        aria-describedby="invite-help"
        className="h-12 rounded-2xl bg-white px-4 font-mono text-sm text-ink ring-1 ring-line outline-none focus:ring-4 focus:ring-dream/35 aria-[invalid=true]:ring-danger"
        data-testid="join-input"
      />
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {t("invalid")}
        </p>
      )}
      <p id="invite-help" className="text-xs text-ink-muted">
        {t("help")}
      </p>
      <Button type="submit" size="lg" className="self-start" data-testid="join-submit">
        {t("submit")} <ArrowRight aria-hidden />
      </Button>
    </form>
  );
}
