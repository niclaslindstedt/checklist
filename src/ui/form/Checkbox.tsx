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
  /**
   * Render the box inert — drawn, aligned, and announced, but not operable.
   * A template's rows use this: a template describes what to do, it never
   * tracks whether it's been done, so its boxes are shown (the rows must still
   * read as checklist items) with the tick permanently out of reach.
   */
  disabled?: boolean;
};

export function Checkbox({
  checked,
  onChange,
  ariaLabel,
  className,
  onMouseDown,
  size = "md",
  disabled = false,
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
      className={`inline-flex shrink-0 items-center ${
        disabled ? "cursor-default" : "cursor-pointer"
      } ${className ?? ""}`.trim()}
    >
      <input
        type="checkbox"
        checked={checked}
        // Guarded as well as `disabled`: a browser suppresses change events on
        // a disabled input, but a synthetic dispatch (a test, an assistive
        // tool) does not, and an inert box must never report a change.
        onChange={(e) => {
          if (disabled) return;
          onChange(e.target.checked);
        }}
        aria-label={ariaLabel}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`flex ${boxSize} items-center justify-center rounded-sm border-2 text-page-bg transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
          disabled ? "border-dashed border-line" : "border-muted"
        }`}
      >
        <CheckIcon
          className={`${tickSize} ${checked ? "opacity-100" : "opacity-0"}`}
        />
      </span>
    </label>
  );
}
