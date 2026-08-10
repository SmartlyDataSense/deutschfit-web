"use client";

import { useParams } from "next/navigation";

import { CoachChatScreen } from "@/learner/coach/screens/CoachChatScreen";

/**
 * Optional catch-all route: `/{locale}/app/coach/chat` (fresh-or-resume)
 * and `/{locale}/app/coach/chat/{threadId}` (a specific thread) both
 * resolve here. `params.thread` is `undefined` for the bare path and a
 * one-element array (`[threadId]`) for the parametrized path — only the
 * first segment is meaningful (S9 · Task 9.4).
 */
export default function CoachChatPage() {
  const params = useParams<{ thread?: string[] }>();
  return <CoachChatScreen routeThreadId={params.thread?.[0]} />;
}
