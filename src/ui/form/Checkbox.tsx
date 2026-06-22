import type { MouseEvent } from "react";

import { CheckIcon } from "../icons.tsx";

// Accessible custom checkbox, mirroring the budget project's `Checkbox`.
// The native input is visually hidden (`sr-only`) but still receives
// focus, fires change events, and is announced by screen readers; a
// sibling <span> renders the visual, keyed off the input's `:checked`
// state via Tailwind's `peer:` variant. The native checkbox chrome is
// never shown.

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Accessible label — the visible label (the item title) lives outside
  // the control, so the checkbox carries its own name for screen readers.
  ariaLabel: string;
  className?: string;
  /**
   * Optional press hook on the control. The row editor uses it to
   * `preventDefault()` the press so tapping the checkbox doesn't blur the
   * open title field (which would commit and close the editor) — iOS doesn't
   * focus the label on tap, so the field would otherwise lose focus.
   */
  onMouseDown?: (e: MouseEvent<HTMLLabelElement>) => void;
  /**
   * Visual size of the box itself — **not** the touch target, which the
   * caller sizes via padding in `className`. `"sm"` shrinks only the drawn
   * square (and its tick) so a sub-item's box reads as smaller than its
   * parent's while staying just as easy to hit.
   */
  size?: "md" | "sm";
};

export function Checkbox({
  checked,
  onChange,
  ariaLabel,
  className,
  onMouseDown,
  size = "md",
}: Props) {
  const boxSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const tickSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    // The label wraps a focusable checkbox, so it is interactive in practice;
    // the press hook (used by the row editor to keep an open field focused) is
    // a legitimate listener the non-interactive-element rule misflags here.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <label
      onMouseDown={onMouseDown}
      className={`inline-flex shrink-0 cursor-pointer items-center ${className ?? ""}`.trim()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`flex ${boxSize} items-center justify-center rounded-sm border-2 border-muted text-page-bg transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent`}
      >
        <CheckIcon
          className={`${tickSize} ${checked ? "opacity-100" : "opacity-0"}`}
        />
      </span>
    </label>
  );
}
