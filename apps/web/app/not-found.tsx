import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@happyroom/ui";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span className="text-5xl" aria-hidden>
        🧁
      </span>
      <h1 className="font-display text-3xl font-extrabold text-ink">{t("notFoundTitle")}</h1>
      <p className="text-ink-soft">{t("notFoundBody")}</p>
      <Button asChild>
        <Link href="/">{t("home")}</Link>
      </Button>
    </main>
  );
}
