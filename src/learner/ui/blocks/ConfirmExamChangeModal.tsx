"use client";

/**
 * `ConfirmExamChangeModal` — web port of
 * `mobile/src/ui/blocks/ConfirmExamChangeModal.tsx`. Presentation-only:
 * every string arrives pre-translated. Variant drives the confirm CTA
 * treatment — `board` (hard consequence) = warning-red, `level` (soft
 * advisory) = text-primary dark (`bg-text-primary`, mobile
 * ConfirmExamChangeModal.tsx:76). Gold "•" bullets (mobile parity).
 */
import { useEffect, useRef } from "react";
import clsx from "clsx";

import { AppText } from "@/learner/ui/primitives";

export interface ConfirmExamChangeModalProps {
  readonly visible: boolean;
  readonly variant: "board" | "level";
  readonly title: string;
  readonly subtitle: string;
  readonly bullets: readonly string[];
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly testID?: string;
}

export function ConfirmExamChangeModal({
  visible,
  variant,
  title,
  subtitle,
  bullets,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  testID = "settings-confirm-exam-change-modal",
}: ConfirmExamChangeModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible) dialogRef.current?.focus();
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay-scrim)] p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={`${title}. ${subtitle}`}
        tabIndex={-1}
        data-testid={testID}
        className="w-full max-w-sm rounded-[var(--radius-lg)] bg-bg-card p-6 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div data-testid={`${testID}-card`}>
          <AppText as="h2" size="h3" weight="bold" family="serif" tone="primary">
            {title}
          </AppText>
          <AppText size="body" tone="secondary" className="mt-2">
            {subtitle}
          </AppText>
          <ul className="mt-4 flex flex-col gap-2">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <AppText size="body" tone="gold" aria-hidden="true">
                  •
                </AppText>
                <AppText size="small" tone="primary">
                  {bullet}
                </AppText>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              data-testid={`${testID}-confirm`}
              onClick={onConfirm}
              className={clsx(
                "min-h-11 rounded-full px-4 transition hover:opacity-90 active:opacity-80",
                variant === "board" ? "bg-warning-red" : "bg-text-primary"
              )}
            >
              <AppText size="body" weight="semi" tone="inverse">
                {confirmLabel}
              </AppText>
            </button>
            <button
              type="button"
              data-testid={`${testID}-cancel`}
              onClick={onCancel}
              className="min-h-11 rounded-full px-4 transition hover:bg-cream-deep"
            >
              <AppText size="body" weight="medium" tone="primary">
                {cancelLabel}
              </AppText>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
