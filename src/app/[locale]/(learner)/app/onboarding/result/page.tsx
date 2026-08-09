"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DiagnosticResultScreen } from "@/learner/onboarding/screens/DiagnosticResultScreen";

function Inner() {
  const mode =
    useSearchParams().get("mode") === "retake" ? ("retake" as const) : ("onboarding" as const);
  return <DiagnosticResultScreen mode={mode} />;
}
export default function OnboardingResultPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
