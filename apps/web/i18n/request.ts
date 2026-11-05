import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isSupportedLocale, LOCALE_COOKIE, negotiateLocale } from "./locale";

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isSupportedLocale(cookieLocale)
    ? cookieLocale
    : negotiateLocale((await headers()).get("accept-language"));

  return {
    locale,
    // Timestamps are stored in UTC; rendering happens in the viewer's or the event's time zone.
    timeZone: "UTC",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
