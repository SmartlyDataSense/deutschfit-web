import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "../globals.css";

// Brand fonts — TTF files are hard-copied from
// deutschfit-mobile/assets/fonts/ on 2026-04-25. The CSS variable names
// (--font-inter, --font-playfair, --font-ibm-mono) are referenced by the
// @theme inline block in src/app/globals.css.
const inter = localFont({
  src: [
    { path: "../../../public/fonts/Inter-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../public/fonts/Inter-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../../public/fonts/Inter-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../../public/fonts/Inter-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const playfair = localFont({
  src: [
    {
      path: "../../../public/fonts/PlayfairDisplay-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/fonts/PlayfairDisplay-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../public/fonts/PlayfairDisplay-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-playfair",
  display: "swap",
});

const ibmPlexMono = localFont({
  src: [
    { path: "../../../public/fonts/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../../public/fonts/IBMPlexMono-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-ibm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "DeutschFit", template: "%s · DeutschFit" },
  description: "Préparation aux examens d'allemand · Goethe, ÖSD, telc, TestDaF",
  applicationName: "DeutschFit",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "any" },
      { url: "/brand/favicon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png" }],
  },
  openGraph: {
    title: "DeutschFit",
    description: "Préparation aux examens d'allemand · Goethe, ÖSD, telc, TestDaF",
    images: ["/brand/icon.png"],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "DeutschFit",
    description: "Préparation aux examens d'allemand · Goethe, ÖSD, telc, TestDaF",
    images: ["/brand/icon.png"],
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Lock the locale for this segment so server components (RSC pages,
  // generateMetadata, error boundaries) read the correct messages.
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${playfair.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
