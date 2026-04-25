import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

type Variant = "display" | "h1" | "h2" | "h3" | "body" | "small" | "caption" | "mono";

const variantClass: Record<Variant, string> = {
  display: "font-display text-[42px] leading-[1.15] tracking-tight",
  h1: "font-display text-[34px] leading-[1.15] tracking-tight",
  h2: "font-display text-[28px] leading-[1.2]",
  h3: "font-sans font-semibold text-[22px] leading-[1.3]",
  body: "font-sans text-[16px] leading-[1.5]",
  small: "font-sans text-[14px] leading-[1.45]",
  caption: "font-sans text-[12px] leading-[1.4] text-text-tertiary",
  mono: "font-mono text-[14px] leading-[1.45]",
};

const variantTag: Record<Variant, keyof React.JSX.IntrinsicElements> = {
  display: "h1",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  body: "p",
  small: "p",
  caption: "p",
  mono: "code",
};

type TextProps = HTMLAttributes<HTMLElement> & {
  variant?: Variant;
  as?: keyof React.JSX.IntrinsicElements;
  children?: ReactNode;
};

/**
 * Typography primitive. Pick the visual `variant` (independent of the HTML
 * element) and optionally override the rendered tag with `as`.
 */
export function Text({ variant = "body", as, className, children, ...rest }: TextProps) {
  const Tag = (as ?? variantTag[variant]) as "p";
  return (
    <Tag className={clsx(variantClass[variant], className)} {...rest}>
      {children}
    </Tag>
  );
}
