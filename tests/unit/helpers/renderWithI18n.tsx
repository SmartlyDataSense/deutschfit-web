/**
 * Shared `renderWithI18n` test harness — copied (not moved) from the
 * file-local helper in `tests/unit/learner-chrome.test.tsx:28-31` (Task
 * 4.5). That file keeps its own private copy untouched; every learner
 * component test written from S4 onward imports this shared version
 * instead of re-declaring it.
 *
 * Renders `ui` inside a real `I18nextProvider` backed by the actual
 * learner i18next instance (`initLearnerI18n("fr")`) rather than mocking
 * `react-i18next` — this also catches a missing/renamed i18n key, which a
 * mocked `t()` wouldn't.
 *
 * Vitest only collects `*.test.*`/`*.spec.*` files, so this module living
 * under `tests/unit/helpers/` is never itself run as a suite.
 */
import { render } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { ReactElement } from "react";

import { initLearnerI18n } from "@/learner/core/i18n";

export function renderWithI18n(ui: ReactElement) {
  const instance = initLearnerI18n("fr");
  return render(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>);
}
