import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

// Shared button chrome, mirroring the budget project's `Button`. Three
// colour variants cover the app's needs; the native button is fully
// restyled. Forwards every standard `<button>` attribute and defaults
// `type="button"` so a button inside a form never submits by accident —
// pass `type="submit"` explicitly when that's wanted.

export type ButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "border-accent bg-accent/10 font-bold text-accent hover:bg-accent/20",
  secondary: "border-line text-muted hover:text-fg",
  danger: "border-danger/60 bg-danger/10 text-danger hover:bg-danger/20",
};

const BASE_CLASS =
  "cursor-pointer rounded-sm border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "secondary", children, className = "", type = "button", ...rest },
  ref,
) {
  const merged = `${BASE_CLASS} ${VARIANT_CLASS[variant]} ${className}`.trim();
  return (
    <button ref={ref} type={type} className={merged} {...rest}>
      {children}
    </button>
  );
});
