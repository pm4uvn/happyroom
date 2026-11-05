"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@happyroom/ui";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  useEffect(() => {
    // Only the digest is reported: messages can contain user data.
    console.error("render_error", { digest: error.digest });
  }, [error]);
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span className="text-5xl" aria-hidden>
        🎈
      </span>
      <h1 className="font-display text-3xl font-extrabold text-ink">{t("title")}</h1>
      <p className="text-ink-soft">{t("body")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </main>
  );
}
