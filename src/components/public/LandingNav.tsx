import Image from "next/image";
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
      <Link href="/" className="flex items-center gap-2" aria-label={t("common.appName")}>
        <Image
          src="/brand/icon.png"
          alt=""
          width={32}
          height={32}
          priority
          className="h-8 w-8 rounded-md"
        />
        <span className="font-display text-2xl font-bold tracking-tight text-text-primary">
          {t("common.appName")}
        </span>
      </Link>

      <div className="hidden items-center gap-6 sm:flex">
        <Link
          href="/pricing"
          className="text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          {t("nav.pricing")}
        </Link>
        <Link
          href="/how-to-pay"
          className="text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          {t("nav.howToPay")}
        </Link>
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
