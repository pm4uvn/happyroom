"use server";

import { cookies } from "next/headers";
import { isSupportedLocale, LOCALE_COOKIE } from "@/i18n/locale";

/** Persist the visitor's language choice. A preference cookie, not a tracking identifier. */
export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!isSupportedLocale(locale)) return { ok: false };
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
  return { ok: true };
}
