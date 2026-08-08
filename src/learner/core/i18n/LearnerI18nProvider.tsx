"use client";

import { type ReactNode, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { initLearnerI18n } from "./index";

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
 */
export function LearnerI18nProvider({ children, lng }: LearnerI18nProviderProps) {
  const instance = useMemo(() => initLearnerI18n(lng), [lng]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
