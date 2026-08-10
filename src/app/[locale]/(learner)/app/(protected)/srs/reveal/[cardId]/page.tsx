"use client";

import { useParams } from "next/navigation";

import { RevealScreen } from "@/learner/srs/screens/RevealScreen";

/**
 * `/{locale}/app/srs/reveal/[cardId]` — answer + self-rating (S10). Param
 * read here and passed as a prop, same split as
 * `schreiben/feedback/[submissionId]/page.tsx`.
 */
export default function SrsRevealPage() {
  const params = useParams<{ cardId: string }>();
  return <RevealScreen cardId={params.cardId} />;
}
