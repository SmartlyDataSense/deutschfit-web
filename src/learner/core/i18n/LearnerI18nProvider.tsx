"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { initLearnerI18n, whenEnReady } from "./index";

export interface LearnerI18nProviderProps {
  readonly children: ReactNode;
  /**
   * Optional language override, e.g. from a route param or a settings
   * screen. When omitted, resolution falls back to
   * `localStorage["@deutschfit/lang"]`, then `"fr"`.
   */
  readonly lng?: string;
}

/**
 * Client-side provider wrapping the learner app in its own i18next
 * instance. Must be mounted above any component calling `useTranslation()`
 * from `react-i18next` within `src/learner/**`.
 *
 * `fr` (the default) is bundled statically and resolves synchronously, so
 * the `fr` path renders `children` immediately — no gating, no frame where
 * this renders `null` (SSR paints whatever the initial state is, so a `fr`
 * boot must never depend on an effect running first). `en` is a lazy
 * fallback catalog (see `index.ts`): when the resolved boot language is
 * `"en"`, this withholds `children` for one frame until `whenEnReady()`
 * resolves, so an `/en/…` visit never flashes a raw i18n key before the
 * catalogs land.
 */
export function LearnerI18nProvider({ children, lng }: LearnerI18nProviderProps) {
  const instance = useMemo(() => initLearnerI18n(lng), [lng]);
  const [enReady, setEnReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void whenEnReady().then(() => {
      if (!cancelled) setEnReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isEnBoot = instance.language === "en";
  if (isEnBoot && !enReady) {
    return null;
  }

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
