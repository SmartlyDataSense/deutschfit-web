import { notFound } from "next/navigation";

import { GalleryClient } from "./GalleryClient";

/**
 * Dev-only gallery — renders every S0.8 learner primitive in labeled
 * sections so visual regressions are one Playwright screenshot away.
 *
 * Gated out of production builds unless explicitly opted in via
 * `NEXT_PUBLIC_ENABLE_GALLERY=1` (e.g. the `learner-gallery` e2e spec sets
 * this when booting the prod-mode Playwright web server). Mirrors the
 * `requireOperator` pattern elsewhere in the app: a 404, not a redirect —
 * don't leak that a dev route exists.
 *
 * The gate MUST run here, in a Server Component, not in the client body
 * (`GalleryClient`) — `notFound()` called from a `"use client"` component
 * only swaps in the not-found UI after hydration, so the initial HTTP
 * response would still be a 200. Calling it here, with no dynamic APIs
 * involved (env vars only), lets Next.js resolve the branch at build time:
 * a production build without the flag statically emits the 404 page for
 * this route; a build with the flag set emits the real gallery.
 */
export default function GalleryPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_GALLERY !== "1") {
    notFound();
  }

  return <GalleryClient />;
}
