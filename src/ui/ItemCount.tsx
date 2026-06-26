import { useRef, useState } from "react";

import { useT } from "../i18n";
import { FloatingPanel } from "./FloatingPanel.tsx";
import { CheckIcon, CloseIcon } from "./icons.tsx";

// The header progress badge: a small ring that fills as items get checked,
// paired with the "checked / total" fraction. Sized and bordered to sit on
// the same row as the copy and sync glyphs (h-9) so the header reads as one
// control group instead of a stray number. The ring and the checked count
// pick up the success accent once every item is checked, so a finished list
// reads at a glance.
//
// Pressing the badge opens a small dropdown of bulk actions — Check all /
// Uncheck all — anchored to its right edge so it opens down-and-to-the-left
// of the chip and stays on screen. The badge stays a static, non-interactive
// span when no handlers are wired (the list is empty, or a caller renders it
// for display only), so the affordance only appears when there's something to
// act on.

// Ring geometry: an 18px box (matching the neighbouring glyphs) with a 7px
// radius track, rotated so the arc starts at twelve o'clock and fills
// clockwise.
const RING_RADIUS = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ItemCount({
  checked,
  total,
  onCheckAll,
  onUncheckAll,
}: {
  checked: number;
  total: number;
  // Bulk-check every item. Omit (alongside `onUncheckAll`) to render the
  // badge as a static, non-interactive counter.
  onCheckAll?: () => void;
  onUncheckAll?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const done = total > 0 && checked === total;
  const fraction = total > 0 ? checked / total : 0;
  const label = t("app.itemCount", { checked, total });

  // The dropdown is only worth offering when there are items and both bulk
  // verbs are wired; otherwise the badge is a plain readout.
  const interactive = total > 0 && !!onCheckAll && !!onUncheckAll;

  const tone = done
    ? "border-success/40 text-success"
    : "border-line text-muted";

  const inner = (
    <>
      <svg
        viewBox="0 0 18 18"
        className="h-[18px] w-[18px] -rotate-90"
        aria-hidden
      >
        <circle
          cx="9"
          cy="9"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="opacity-20"
        />
        <circle
          cx="9"
          cy="9"
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span>
        <span className={done ? undefined : "text-fg"}>{checked}</span>
        <span className="opacity-60">/{total}</span>
      </span>
    </>
  );

  const badgeClasses = `inline-flex h-9 shrink-0 items-center gap-1.5 rounded border px-2.5 text-sm tabular-nums select-none ${tone}`;

  if (!interactive) {
    return (
      <span className={badgeClasses} title={label} aria-label={label}>
        {inner}
      </span>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={`${badgeClasses} cursor-pointer transition-colors hover:border-accent hover:text-fg-bright focus-visible:border-accent focus-visible:outline-none`}
      >
        {inner}
      </button>

      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={{
          width: { kind: "min", minPx: 160 },
          anchor: "right",
          coordinateSpace: "document",
        }}
        className="py-1"
      >
        <div
          role="menu"
          aria-label={t("app.itemCountActions")}
          className="outline-none"
        >
          <button
            type="button"
            role="menuitem"
            disabled={checked === total}
            onClick={() => {
              setOpen(false);
              onCheckAll!();
            }}
            className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm text-fg hover:bg-surface-3 hover:text-fg-bright disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg"
          >
            <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
            <span className="flex-1">{t("app.checkAll")}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={checked === 0}
            onClick={() => {
              setOpen(false);
              onUncheckAll!();
            }}
            className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm text-fg hover:bg-surface-3 hover:text-fg-bright disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg"
          >
            <CloseIcon className="h-3.5 w-3.5 shrink-0 text-danger" />
            <span className="flex-1">{t("app.uncheckAll")}</span>
          </button>
        </div>
      </FloatingPanel>
    </>
  );
}
