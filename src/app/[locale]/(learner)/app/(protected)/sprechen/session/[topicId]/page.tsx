"use client";

import { useParams } from "next/navigation";

import { SprechenSessionScreen } from "@/learner/sprechen/screens/SprechenSessionScreen";

export default function SprechenSessionPage() {
  const params = useParams<{ topicId: string }>();
  return <SprechenSessionScreen topicId={params.topicId} />;
}
