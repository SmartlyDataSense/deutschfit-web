import type { InputHTMLAttributes } from "react";
import clsx from "clsx";

/**
 * Form-input primitive. Token-driven border, padding, and focus ring. Use
 * for email entry, payment-proof reference codes, admin search, etc.
 */
export function Input({ className, type, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type ?? "text"}
      className={clsx(
        "w-full rounded-md border border-line-strong bg-bg-card px-3 py-2",
        "text-base text-text-primary placeholder:text-text-tertiary",
        "focus:outline-none focus:ring-2 focus:ring-cta focus:border-cta",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...rest}
    />
  );
}
