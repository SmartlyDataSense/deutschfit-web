"use client";

import { RevisionScreen } from "@/learner/srs/screens/RevisionScreen";

/**
 * `/{locale}/app/srs` — SRS revision queue (S10). Local-only surface:
 * reads/writes the learner IndexedDB, never the network.
 */
export default function SrsRevisionPage() {
  return <RevisionScreen />;
}
