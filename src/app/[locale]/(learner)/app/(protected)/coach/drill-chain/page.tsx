"use client";

import { CoachDrillChainScreen } from "@/learner/coach/screens/CoachDrillChainScreen";

/**
 * `/{locale}/app/coach/drill-chain` — the personalised connector-drill
 * runner (S9 · Task 9.5). Carries no route params; the launch payload is
 * handed off via `useDrillChainStore` by the Coach chat screen's drill
 * CTA immediately before the `router.push` that lands here.
 */
export default function CoachDrillChainPage() {
  return <CoachDrillChainScreen />;
}
