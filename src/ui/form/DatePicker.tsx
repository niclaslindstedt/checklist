import { useEffect, useMemo, useRef, useState } from "react";

import {
  addMonths,
  buildMonthGrid,
  parseISODate,
  toISODate,
  type DayCell,
} from "../../domain/calendar.ts";
import { bcp47, useLang, useT } from "../../i18n";
import type { Lang } from "../../i18n/locale.ts";
import { FloatingPanel } from "../FloatingPanel.tsx";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons.tsx";

// A dependency-free calendar date picker that replaces the native
// `<input type="date">`. The native control is unusable inside an iOS
// standalone PWA: its popover calendar dismisses itself the moment you tap the
// month header to navigate, so a user has to reopen it and land on the right
// month by luck. This custom picker renders its own calendar grid in a
// `FloatingPanel` (the same popover shell `SelectPicker` uses), so month
// navigation is ordinary in-page interaction that iOS can't tear down.
//
// Value is a `YYYY-MM-DD` string (empty for "no date"). All calendar maths
// lives in the pure `domain/calendar.ts`; this component only renders it and
// tracks which month is on screen.

type Props = {
  // The selected day as `YYYY-MM-DD`, or "" when nothing is picked yet.
  value: string;
  onChange: (next: string) => void;
  // Names the trigger for assistive tech; the surrounding <label> supplies the
  // visible text.
  ariaLabel?: string;
  // Placeholder shown on the trigger when no date is selected.
  placeholder?: string;
};

// Which weekday sits in the leftmost column, per language (0 = Sunday). Swedish
// calendars start on Monday; English (en-GB here) also starts on Monday, but we
// keep the map explicit so a future locale picks its own convention.
const WEEK_STARTS_ON: Record<Lang, number> = { en: 1, sv: 1 };

/** Short weekday headers ("Mo", "Tu", …) for the grid, ordered from
 *  `weekStartsOn`, in the active locale. */
function weekdayHeaders(lang: Lang, weekStartsOn: number): string[] {
  const fmt = new Intl.DateTimeFormat(bcp47(lang), { weekday: "short" });
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    // 2024-01-07 is a Sunday; add the column offset to walk the week.
    const dt = new Date(Date.UTC(2024, 0, 7 + ((weekStartsOn + i) % 7)));
    out.push(fmt.format(dt));
  }
  return out;
}

/** "January 2026" style caption for the month being shown, in the locale. */
function monthCaption(lang: Lang, year: number, month: number): string {
  return new Intl.DateTimeFormat(bcp47(lang), {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** The full weekday + day label an assistive-tech user hears on a day button. */
function dayAriaLabel(lang: Lang, cell: DayCell): string {
  return new Intl.DateTimeFormat(bcp47(lang), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(cell.year, cell.month - 1, cell.day)));
}

/** Trigger label for the currently-selected value, in the locale. */
function triggerLabel(lang: Lang, value: string): string | null {
  const parsed = parseISODate(value);
  if (!parsed) return null;
  return new Intl.DateTimeFormat(bcp47(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)));
}

export function DatePicker({ value, onChange, ariaLabel, placeholder }: Props) {
  const lang = useLang();
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const weekStartsOn = WEEK_STARTS_ON[lang];

  // Today's `YYYY-MM-DD` for the "today" ring. Read once per render from the
  // local clock — a presentation concern, so it stays out of the pure domain.
  const todayIso = useMemo(() => {
    const now = new Date();
    return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }, []);

  // The month currently on screen. Seeds from the selected value (or today when
  // empty) and is re-seeded each time the panel opens so reopening always lands
  // on the relevant month rather than wherever the user last browsed.
  const [view, setView] = useState(() => seedView(value, todayIso));
  useEffect(() => {
    if (open) setView(seedView(value, todayIso));
  }, [open, value, todayIso]);

  const grid = useMemo(
    () => buildMonthGrid(view.year, view.month, weekStartsOn),
    [view.year, view.month, weekStartsOn],
  );
  const headers = useMemo(
    () => weekdayHeaders(lang, weekStartsOn),
    [lang, weekStartsOn],
  );

  const label = triggerLabel(lang, value);

  const step = (delta: number) =>
    setView((v) => addMonths(v.year, v.month, delta));

  const pick = (cell: DayCell) => {
    onChange(cell.iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm focus:border-accent focus:outline-none ${
          label ? "text-fg-bright" : "text-muted"
        }`}
      >
        <span className="truncate">{label ?? placeholder ?? ""}</span>
      </button>

      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={{
          width: { kind: "min", minPx: 260 },
          anchor: "left",
          coordinateSpace: "document",
        }}
        className="p-2"
      >
        <div role="dialog" aria-label={ariaLabel} className="w-64">
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              aria-label={t("common.prevMonth")}
              onClick={() => step(-1)}
              className="rounded p-1 text-muted hover:bg-surface hover:text-fg-bright focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span
              aria-live="polite"
              className="text-sm font-semibold text-fg-bright"
            >
              {monthCaption(lang, view.year, view.month)}
            </span>
            <button
              type="button"
              aria-label={t("common.nextMonth")}
              onClick={() => step(1)}
              className="rounded p-1 text-muted hover:bg-surface hover:text-fg-bright focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {headers.map((h, i) => (
              <div
                key={i}
                aria-hidden
                className="py-1 text-center text-[0.65rem] font-medium tracking-wide text-muted uppercase"
              >
                {h}
              </div>
            ))}
            {grid.flat().map((cell) => {
              const selected = cell.iso === value;
              const isToday = cell.iso === todayIso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  aria-label={dayAriaLabel(lang, cell)}
                  aria-pressed={selected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => pick(cell)}
                  className={`flex h-8 items-center justify-center rounded text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                    selected
                      ? "bg-accent font-semibold text-page-bg"
                      : cell.inMonth
                        ? "text-fg-bright hover:bg-surface"
                        : "text-muted hover:bg-surface"
                  } ${isToday && !selected ? "ring-1 ring-inset ring-accent/60" : ""}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      </FloatingPanel>
    </>
  );
}

/** Which month to show first: the selected value's month, else today's. */
function seedView(
  value: string,
  todayIso: string,
): { year: number; month: number } {
  const anchor = parseISODate(value) ?? parseISODate(todayIso);
  // `todayIso` is always a valid day, so `anchor` is never null in practice.
  return { year: anchor!.year, month: anchor!.month };
}
