// Tiny inline SVG icon set. Budget pulls icons from `lucide-react`; the
// checklist needs only a couple, so we inline them rather than add a
// dependency. Each takes a `className` so callers control size and
// colour through Tailwind utilities (icons paint with `currentColor`).

type IconProps = { className?: string };

export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path d="M13 4.5 6.5 11.5 3 8" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      className={className}
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
