import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Brand fonts — TTF files are hard-copied from
// deutschfit-mobile/assets/fonts/ on 2026-04-25. Re-copy when the mobile
// repo bumps its bundled fonts. The CSS variable names (--font-inter,
// --font-playfair, --font-ibm-mono) are referenced by the @theme inline
// block in src/app/globals.css.
const inter = localFont({
  src: [
    { path: "../../public/fonts/Inter-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/Inter-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/Inter-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/Inter-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const playfair = localFont({
  src: [
    { path: "../../public/fonts/PlayfairDisplay-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/PlayfairDisplay-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/PlayfairDisplay-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-playfair",
  display: "swap",
});

const ibmPlexMono = localFont({
  src: [
    { path: "../../public/fonts/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/IBMPlexMono-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-ibm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DeutschFit",
  description: "Préparation aux examens d'allemand · Goethe, ÖSD, telc, TestDaF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${ibmPlexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
