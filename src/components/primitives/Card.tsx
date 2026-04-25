import type { HTMLAttributes } from "react";
import clsx from "clsx";

/**
 * Surface primitive — a panel with neutral card background, subtle border,
 * and a soft elevation. Use it for any boxed content (pricing tile, account
 * card, admin row group). Caller still controls padding/gap.
 */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "bg-bg-card border border-line-soft rounded-lg shadow-sm",
        "p-6",
        className
      )}
      {...rest}
    />
  );
}
