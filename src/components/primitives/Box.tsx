import type { HTMLAttributes } from "react";
import clsx from "clsx";

/**
 * Layout primitive — semantic-free <div> wrapper that participates in the
 * project's spacing/colour tokens. Use Box only for layout (padding, gap,
 * grid). Anything that should communicate meaning (heading, paragraph,
 * label) belongs in Text.
 */
export function Box({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx(className)} {...rest} />;
}
