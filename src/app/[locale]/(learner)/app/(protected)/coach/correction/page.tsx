"use client";

import { CorrectionPickerScreen } from "@/learner/coach/correction/screens/CorrectionPickerScreen";

/**
 * Correction picker route — Task 9.9. `"use client"` (same rationale as
 * every other `(protected)` route). The coach hub's "correction" tile
 * already links to `${base}/coach/correction` (`hubTiles.ts`, Task 9.3).
 */
export default function CorrectionPickerPage() {
  return <CorrectionPickerScreen />;
}
