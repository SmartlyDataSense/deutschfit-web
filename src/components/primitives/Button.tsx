import type { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "bg-cta text-cta-ink hover:opacity-90 active:opacity-80",
  secondary: "bg-cream-deep text-cream-ink hover:bg-cream",
  ghost: "bg-transparent text-text-primary hover:bg-cream-deep",
};

const sizeClass: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-base",
  lg: "px-6 py-3 text-lg",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      // explicit type fallback so a Button inside <form> doesn't accidentally
      // submit the form when the consumer forgot to specify type
      type={type ?? "button"}
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-semibold transition",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-cta",
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...rest}
    />
  );
}
