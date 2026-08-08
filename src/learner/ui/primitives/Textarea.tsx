import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import clsx from "clsx";

import { AppText } from "./AppText";

/**
 * `Textarea` — ports `deutschfit-mobile/src/ui/primitives/Textarea.tsx`.
 * Same visual contract as `Input`, but multi-line with a taller default
 * min-height and internal scroll once it hits `maxHeight` (so a long
 * Schreiben draft doesn't push the submit CTA off-screen).
 */
export interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> {
  readonly label?: string;
  readonly helper?: string;
  readonly error?: string;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly containerClassName?: string;
  readonly testID?: string;
}

/** ~12 lines of body text (16px * 1.5 line-height) + the textarea's
 * vertical padding — mirrors mobile's DEFAULT_MAX_HEIGHT derivation. */
const DEFAULT_MAX_LINES = 12;
const BODY_LINE_HEIGHT_PX = 16 * 1.5;
const VERTICAL_PADDING_PX = 10 * 2;
const DEFAULT_MAX_HEIGHT = Math.round(
  BODY_LINE_HEIGHT_PX * DEFAULT_MAX_LINES + VERTICAL_PADDING_PX
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    helper,
    error,
    minHeight = 140,
    maxHeight = DEFAULT_MAX_HEIGHT,
    containerClassName,
    testID,
    disabled,
    id,
    style,
    ...rest
  },
  ref
) {
  const hasError = Boolean(error);
  const borderClass = hasError
    ? "border-warning-red"
    : disabled
      ? "border-line-soft"
      : "border-line-strong";

  return (
    <div className={containerClassName} data-testid={testID}>
      {label ? (
        <label htmlFor={id} className="mb-1 block text-small font-medium text-text-secondary">
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={id}
        disabled={disabled}
        style={{ minHeight, maxHeight, ...style }}
        className={clsx(
          "w-full resize-none overflow-y-auto rounded-[var(--radius-md)] border bg-bg-card px-4 py-2.5",
          "font-sans text-body text-text-primary placeholder:text-text-tertiary",
          "focus:outline-none focus:ring-2 focus:ring-cta",
          "disabled:cursor-not-allowed disabled:opacity-70",
          borderClass
        )}
        {...rest}
      />
      {hasError ? (
        <AppText tone="warning" size="caption" className="mt-1">
          {error}
        </AppText>
      ) : helper ? (
        <AppText tone="tertiary" size="caption" className="mt-1">
          {helper}
        </AppText>
      ) : null}
    </div>
  );
});
