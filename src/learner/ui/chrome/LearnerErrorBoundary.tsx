"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/learner/ui/primitives";

/**
 * `LearnerErrorBoundary` — top-of-tree render-error catcher for the
 * learner app. Ports `deutschfit-mobile/src/core/ui/ErrorBoundary.tsx`: a
 * React class component (the only way to catch render-phase errors — no
 * hook equivalent as of React 19), rendering the canonical empty/error
 * panel with a reload action instead of crashing to a blank page.
 *
 * Class component + a separate function component for the fallback: class
 * components can't call hooks, and the fallback needs `useTranslation()`
 * for FR/EN copy, so `ErrorFallback` below carries that (rendered as a
 * normal child element from `render()`, not called as a hook from the
 * class itself).
 *
 * Deviation from mobile: mobile's retry just clears `hasError` and lets
 * the feature's own `useEffect` re-fetch. This boundary sits at the very
 * top of the tree (wraps all of `LearnerProviders`'s children, per the S1
 * brief), where a render error is more likely to stem from broken
 * module-level/singleton state (e.g. a wedged zustand store) that a local
 * re-render can't fix — so the reload action does a real
 * `window.location.reload()` in addition to clearing local state, giving
 * the learner a guaranteed-clean recovery instead of a maybe-still-broken
 * retry.
 */
export interface LearnerErrorBoundaryProps {
  readonly children: ReactNode;
}

interface LearnerErrorBoundaryState {
  readonly hasError: boolean;
}

export class LearnerErrorBoundary extends Component<
  LearnerErrorBoundaryProps,
  LearnerErrorBoundaryState
> {
  public override state: LearnerErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): LearnerErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Never swallow silently — this is the last line of defense before a
    // blank screen. Production telemetry (PostHog exception capture) is a
    // later-slice follow-up; console.error is unconditional (not gated on
    // NODE_ENV) so it also surfaces in the Playwright/browser-smoke console
    // checks this project relies on.
    console.error("[LearnerErrorBoundary] caught:", error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    this.setState({ hasError: false });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback onReload={this.handleReload} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ onReload }: { readonly onReload: () => void }) {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <EmptyState
        testID="learner-error-boundary"
        title={t("common:error.genericTitle")}
        description={t("common:error.genericBody")}
        actionLabel={t("common:actions.retry")}
        onAction={onReload}
      />
    </div>
  );
}
