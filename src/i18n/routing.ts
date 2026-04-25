import { defineRouting } from "next-intl/routing";

/**
 * Locale config for the public web surface.
 *
 * v1 ships English + French only. Admin (/admin) is English-only and lives
 * outside the [locale] segment, so the middleware matcher excludes it.
 *
 * localePrefix "always" — both /en/... and /fr/... carry the prefix; the
 * root URL "/" redirects to "/en". This matches the design spec and keeps
 * URLs unambiguous for the operator's links in activation emails.
 */
export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
