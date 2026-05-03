import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * Public top-nav for marketing surfaces. Brand mark on the left, locale
 * switcher on the right, key links in the middle on wider screens.
 */
export async function LandingNav() {
  const t = await getTranslations();
  return (
    <nav className="flex items-center justify-between border-b border-line-soft pb-4">
      <Link
        href="/"
        className="font-display text-2xl font-bold tracking-tight text-text-primary"
      >
        {t("common.appName")}
      </Link>

      <div className="hidden items-center gap-6 sm:flex">
        <Link
          href="/account"
          className="text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          {t("nav.account")}
        </Link>
      </div>

      <LocaleSwitcher />
    </nav>
  );
}
