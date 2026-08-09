"use client";

import { useParams } from "next/navigation";

import { SprechenFeedbackScreen } from "@/learner/sprechen/screens/SprechenFeedbackScreen";

export default function SprechenFeedbackPage() {
  const params = useParams<{ submissionId: string }>();
  return <SprechenFeedbackScreen submissionId={params.submissionId} />;
}
