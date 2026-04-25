"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";

/**
 * Minimal EN ⇄ FR toggle. Renders the *other* locale as the link label so
 * the action is always self-explanatory ("French" when reading English,
 * etc). Preserves the current pathname when switching.
 */
export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("nav");
  const [isPending, startTransition] = useTransition();

  const next = locale === "en" ? "fr" : "en";
  const label = next === "fr" ? t("switchToFr") : t("switchToEn");

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.replace(pathname, { locale: next });
        });
      }}
      className="text-sm font-medium text-text-secondary underline underline-offset-4 hover:text-text-primary disabled:opacity-50"
      aria-label={`Switch language to ${label}`}
    >
      {label}
    </button>
  );
}

// Static helper for tests / non-DOM consumers
export const SUPPORTED_LOCALES = routing.locales;
