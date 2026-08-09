"use client";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";

import { newIdempotencyKey } from "@/learner/core/api/client";
import { hydrateExamContext, useExamContextStore } from "@/learner/core/exam/examContext";
import { DiagnosticScreen } from "@/learner/onboarding/screens/DiagnosticScreen";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function OnboardingDiagnosticPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const ctxLevel = useExamContextStore((s) => s.level);
  const isLoaded = useExamContextStore((s) => s.isLoaded);

  useEffect(() => {
    void hydrateExamContext();
  }, []);

  const mode = params.get("mode") === "retake" ? ("retake" as const) : ("onboarding" as const);
  const levelParam = params.get("level");
  const level =
    levelParam === "b2" || levelParam === "b1"
      ? levelParam
      : ctxLevel === "b2"
        ? ("b2" as const)
        : ("b1" as const); // mobile clamp: everything non-b2 → b1
  const attemptParam = params.get("attempt");
  const attemptId = useMemo(
    () => (attemptParam && UUID_V4_RE.test(attemptParam) ? attemptParam : newIdempotencyKey()),
    [attemptParam]
  );

  // Canonicalize the URL so a reload replays the same frozen pack (and so the
  // bare retake deep link `?mode=retake` self-completes).
  useEffect(() => {
    if (attemptParam !== attemptId && (levelParam || isLoaded)) {
      router.replace(
        `/${locale}/app/onboarding/diagnostic?attempt=${attemptId}&level=${level}&mode=${mode}`
      );
    }
  }, [attemptParam, attemptId, level, levelParam, isLoaded, locale, mode, router]);

  if (!attemptParam && !levelParam && !isLoaded) return null; // waiting for exam context on bare deep link
  return <DiagnosticScreen attemptId={attemptId} level={level} mode={mode} />;
}

export default function OnboardingDiagnosticPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingDiagnosticPageInner />
    </Suspense>
  );
}
