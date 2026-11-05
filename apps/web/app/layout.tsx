import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ConsentBanner } from "@/components/consent-banner";
import "./globals.css";

const body = Nunito({
  subsets: ["latin", "latin-ext", "vietnamese"],
  variable: "--font-body",
  display: "swap",
});
const heading = Baloo_2({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return {
    metadataBase: new URL(appUrl),
    title: t("title"),
    description: t("description"),
    applicationName: "HAPPYROOM",
    openGraph: { title: t("title"), description: t("description"), type: "website", siteName: "HAPPYROOM" },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
  };
}

export const viewport: Viewport = {
  themeColor: "#9178E8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations("nav");
  return (
    <html lang={locale} className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-ink px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider>
          {children}
          <ConsentBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
