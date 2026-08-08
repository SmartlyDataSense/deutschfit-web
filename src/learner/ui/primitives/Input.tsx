import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

import { AppText } from "./AppText";

/**
 * `Input` — ports `deutschfit-mobile/src/ui/primitives/Input.tsx`.
 * Single-line text input with label / helper / error. Border flips to
 * `warningRed` when `error` is set.
 */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  readonly label?: string;
  readonly helper?: string;
  readonly error?: string;
  readonly containerClassName?: string;
  readonly testID?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helper, error, containerClassName, testID, disabled, id, ...rest },
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
      <input
        ref={ref}
        id={id}
        disabled={disabled}
        className={clsx(
          "min-h-12 w-full rounded-[var(--radius-md)] border bg-bg-card px-4 py-2.5",
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
