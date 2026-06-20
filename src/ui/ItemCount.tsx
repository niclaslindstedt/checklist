import { useT } from "../i18n";

// The header progress badge: a small ring that fills as items get checked,
// paired with the "checked / total" fraction. Sized and bordered to sit on
// the same row as the copy and sync glyphs (h-9) so the header reads as one
// control group instead of a stray number. The ring and the checked count
// pick up the success accent once every item is checked, so a finished list
// reads at a glance.

// Ring geometry: an 18px box (matching the neighbouring glyphs) with a 7px
// radius track, rotated so the arc starts at twelve o'clock and fills
// clockwise.
const RING_RADIUS = 7;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ItemCount({
  checked,
  total,
}: {
  checked: number;
  total: number;
}) {
  const t = useT();
  const done = total > 0 && checked === total;
  const fraction = total > 0 ? checked / total : 0;
  const label = t("app.itemCount", { checked, total });

  return (
    <span
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded border px-2.5 text-sm tabular-nums select-none ${
        done ? "border-success/40 text-success" : "border-line text-muted"
      }`}
      title={label}
      aria-label={label}
    >
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
    </span>
  );
}
