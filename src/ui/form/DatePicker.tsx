import { useEffect, useMemo, useRef, useState } from "react";

import {
  addMonths,
  buildMonthGrid,
  parseISODate,
  toISODate,
  yearRangeStart,
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
// Like the native control, the header caption drills through three views so a
// far-off date is a couple of taps away rather than dozens of month steps:
//   • "days"   — the month's day grid (the default).
//   • "months" — the twelve months of the shown year; tapping the caption in
//                the day view opens it.
//   • "years"  — a 3×4 block of years; tapping the caption in the month view
//                opens it.
// Picking a month drops back to its days; picking a year drops back to its
// months — the value only commits when a day is chosen.
//
// Value is a `YYYY-MM-DD` string (empty for "no date"). All calendar maths
// lives in the pure `domain/calendar.ts`; this component only renders it and
// tracks which month / view is on screen.

type Props = {
  // The selected day as `YYYY-MM-DD`, or "" when nothing is picked yet.
  value: string;
  onChange: (next: string) => void;
  // Names the trigger for assistive tech; the surrounding <label> supplies the
  // visible text.
  ariaLabel?: string;
  // Placeholder shown on the trigger when no date is selected.
  placeholder?: string;
  /**
   * The earliest selectable day as `YYYY-MM-DD`, **inclusive**. Days before it
   * are rendered but inert, and the month / year grids grey out any cell whose
   * whole span falls before it, so a user can't navigate into a dead region and
   * wonder why nothing responds. Omitted for an unbounded picker.
   *
   * Comparisons are plain string compares — `YYYY-MM-DD` is lexicographically
   * ordered, which is the same trick the rest of the date code leans on.
   */
  min?: string;
};

// Which drill-down level the calendar body is showing.
type View = "days" | "months" | "years";

// How many years the "years" grid shows at once (a 3×4 block, matching the
// month grid's shape).
const YEAR_BLOCK = 12;

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

/** Short month names ("Jan", "Feb", …), 1-based index 0 unused, in the locale. */
function monthShortNames(lang: Lang): string[] {
  const fmt = new Intl.DateTimeFormat(bcp47(lang), { month: "short" });
  return Array.from({ length: 12 }, (_, m) =>
    fmt.format(new Date(Date.UTC(2024, m, 1))),
  );
}

/** "January 2026" style caption for the month being shown, in the locale. */
function monthCaption(lang: Lang, year: number, month: number): string {
  return new Intl.DateTimeFormat(bcp47(lang), {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Full month name ("January"), for the month-grid buttons' accessible label. */
function monthLongName(lang: Lang, month: number): string {
  return new Intl.DateTimeFormat(bcp47(lang), { month: "long" }).format(
    new Date(Date.UTC(2024, month - 1, 1)),
  );
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

export function DatePicker({
  value,
  onChange,
  ariaLabel,
  placeholder,
  min,
}: Props) {
  const lang = useLang();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("days");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const weekStartsOn = WEEK_STARTS_ON[lang];

  // Today's `YYYY-MM-DD` for the "today" marker. Read once per render from the
  // local clock — a presentation concern, so it stays out of the pure domain.
  const todayIso = useMemo(() => {
    const now = new Date();
    return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }, []);
  const today = parseISODate(todayIso)!;
  const selected = parseISODate(value);

  // The month currently on screen. Seeds from the selected value (or today when
  // empty) and is re-seeded each time the panel opens so reopening always lands
  // on the relevant month rather than wherever the user last browsed.
  const [shown, setShown] = useState(() => seedView(value, todayIso, min));
  useEffect(() => {
    if (open) {
      setShown(seedView(value, todayIso, min));
      setView("days");
    }
  }, [open, value, todayIso, min]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const pickDay = (cell: DayCell) => {
    // Belt and braces: the button is already `disabled`, but a synthetic click
    // (a test, an assistive tool) reaches a Preact handler regardless — see the
    // same guard on `Checkbox`.
    if (min && cell.iso < min) return;
    onChange(cell.iso);
    close();
  };

  const label = triggerLabel(lang, value);

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
          {view === "days" && (
            <DaysView
              lang={lang}
              t={t}
              weekStartsOn={weekStartsOn}
              shown={shown}
              selected={selected}
              today={today}
              onStep={(delta) =>
                setShown((s) => addMonths(s.year, s.month, delta))
              }
              onOpenMonths={() => setView("months")}
              onPickDay={pickDay}
              min={min}
            />
          )}
          {view === "months" && (
            <MonthsView
              lang={lang}
              t={t}
              shown={shown}
              selected={selected}
              today={today}
              onStepYear={(delta) =>
                setShown((s) => ({ ...s, year: s.year + delta }))
              }
              onOpenYears={() => setView("years")}
              onPickMonth={(month) => {
                setShown((s) => ({ ...s, month }));
                setView("days");
              }}
              min={min}
            />
          )}
          {view === "years" && (
            <YearsView
              t={t}
              shown={shown}
              selected={selected}
              today={today}
              onStepBlock={(delta) =>
                setShown((s) => ({ ...s, year: s.year + delta * YEAR_BLOCK }))
              }
              onPickYear={(year) => {
                setShown((s) => ({ ...s, year }));
                setView("months");
              }}
              min={min}
            />
          )}
        </div>
      </FloatingPanel>
    </>
  );
}

// —— Views ————————————————————————————————————————————————————————————————

type T = ReturnType<typeof useT>;
type YM = { year: number; month: number };
type YMD = { year: number; month: number; day: number };

// A prev/next arrow flanking the header caption. Shared by all three views so
// the stepping chrome looks and behaves the same at every drill level.
function StepButton({
  dir,
  label,
  onClick,
}: {
  dir: "prev" | "next";
  label: string;
  onClick: () => void;
}) {
  const Icon = dir === "prev" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded p-1 text-muted hover:bg-surface hover:text-fg-bright focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// The clickable caption between the two arrows that drills to the next view up
// (day → month → year). Rendered as a plain button so the whole label is one
// tap target.
function CaptionButton({
  text,
  label,
  onClick,
}: {
  text: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded px-2 py-0.5 text-sm font-semibold text-fg-bright hover:bg-surface focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {text}
    </button>
  );
}

// Tailwind classes for a grid cell, shared by the month and year buttons:
// selected fills accent, today gets an accent ring, everything else is plain.
// An out-of-range cell (before `min`) is dimmed and loses its hover, so the
// dead region reads as unavailable rather than unresponsive.
function cellClass(
  isSelected: boolean,
  isToday: boolean,
  isDisabled = false,
): string {
  if (isDisabled) {
    return "flex h-10 items-center justify-center rounded text-sm text-muted opacity-40";
  }
  return `flex h-10 items-center justify-center rounded text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
    isSelected
      ? "bg-accent font-semibold text-page-bg"
      : "text-fg-bright hover:bg-surface"
  } ${isToday && !isSelected ? "ring-1 ring-inset ring-accent/60" : ""}`;
}

/** True when every day of `year`-`month` falls before the `min` day. */
function monthBefore(year: number, month: number, min?: string): boolean {
  if (!min) return false;
  // The last day of the month is the latest thing it could offer; if even that
  // is before `min`, nothing in the month is reachable. Day 0 of the next month
  // is the last day of this one.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return toISODate(year, month, lastDay) < min;
}

/** True when every day of `year` falls before the `min` day. */
function yearBefore(year: number, min?: string): boolean {
  return min ? toISODate(year, 12, 31) < min : false;
}

function DaysView({
  lang,
  t,
  weekStartsOn,
  shown,
  selected,
  today,
  onStep,
  onOpenMonths,
  onPickDay,
  min,
}: {
  lang: Lang;
  t: T;
  weekStartsOn: number;
  shown: YM;
  selected: YMD | null;
  today: YMD;
  onStep: (delta: number) => void;
  onOpenMonths: () => void;
  onPickDay: (cell: DayCell) => void;
  min?: string;
}) {
  const grid = useMemo(
    () => buildMonthGrid(shown.year, shown.month, weekStartsOn),
    [shown.year, shown.month, weekStartsOn],
  );
  const headers = useMemo(
    () => weekdayHeaders(lang, weekStartsOn),
    [lang, weekStartsOn],
  );
  const selectedIso = selected
    ? toISODate(selected.year, selected.month, selected.day)
    : null;
  const todayIso = toISODate(today.year, today.month, today.day);

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <StepButton
          dir="prev"
          label={t("common.prevMonth")}
          onClick={() => onStep(-1)}
        />
        <CaptionButton
          text={monthCaption(lang, shown.year, shown.month)}
          label={t("common.chooseMonth")}
          onClick={onOpenMonths}
        />
        <StepButton
          dir="next"
          label={t("common.nextMonth")}
          onClick={() => onStep(1)}
        />
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
          const isSelected = cell.iso === selectedIso;
          const isToday = cell.iso === todayIso;
          const isDisabled = Boolean(min) && cell.iso < min!;
          return (
            <button
              key={cell.iso}
              type="button"
              aria-label={dayAriaLabel(lang, cell)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              disabled={isDisabled}
              onClick={() => onPickDay(cell)}
              className={
                isDisabled
                  ? "flex h-8 items-center justify-center rounded text-sm text-muted opacity-40"
                  : `flex h-8 items-center justify-center rounded text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                      isSelected
                        ? "bg-accent font-semibold text-page-bg"
                        : cell.inMonth
                          ? "text-fg-bright hover:bg-surface"
                          : "text-muted hover:bg-surface"
                    } ${isToday && !isSelected ? "ring-1 ring-inset ring-accent/60" : ""}`
              }
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </>
  );
}

function MonthsView({
  lang,
  t,
  shown,
  selected,
  today,
  onStepYear,
  onOpenYears,
  onPickMonth,
  min,
}: {
  lang: Lang;
  t: T;
  shown: YM;
  selected: YMD | null;
  today: YMD;
  onStepYear: (delta: number) => void;
  onOpenYears: () => void;
  onPickMonth: (month: number) => void;
  min?: string;
}) {
  const names = useMemo(() => monthShortNames(lang), [lang]);

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <StepButton
          dir="prev"
          label={t("common.prevYear")}
          onClick={() => onStepYear(-1)}
        />
        <CaptionButton
          text={String(shown.year)}
          label={t("common.chooseYear")}
          onClick={onOpenYears}
        />
        <StepButton
          dir="next"
          label={t("common.nextYear")}
          onClick={() => onStepYear(1)}
        />
      </div>

      <div className="grid grid-cols-3 gap-1">
        {names.map((name, i) => {
          const month = i + 1;
          const isSelected =
            selected?.year === shown.year && selected?.month === month;
          const isToday = today.year === shown.year && today.month === month;
          const isDisabled = monthBefore(shown.year, month, min);
          return (
            <button
              key={month}
              type="button"
              aria-label={monthLongName(lang, month)}
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => onPickMonth(month)}
              className={cellClass(isSelected, isToday, isDisabled)}
            >
              {name}
            </button>
          );
        })}
      </div>
    </>
  );
}

function YearsView({
  t,
  shown,
  selected,
  today,
  onStepBlock,
  onPickYear,
  min,
}: {
  t: T;
  shown: YM;
  selected: YMD | null;
  today: YMD;
  onStepBlock: (delta: number) => void;
  onPickYear: (year: number) => void;
  min?: string;
}) {
  const start = yearRangeStart(shown.year, YEAR_BLOCK);
  const years = Array.from({ length: YEAR_BLOCK }, (_, i) => start + i);

  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <StepButton
          dir="prev"
          label={t("common.prevYears")}
          onClick={() => onStepBlock(-1)}
        />
        <span
          aria-live="polite"
          className="px-2 py-0.5 text-sm font-semibold text-fg-bright"
        >
          {start}–{start + YEAR_BLOCK - 1}
        </span>
        <StepButton
          dir="next"
          label={t("common.nextYears")}
          onClick={() => onStepBlock(1)}
        />
      </div>

      <div className="grid grid-cols-3 gap-1">
        {years.map((year) => {
          const isSelected = selected?.year === year;
          const isToday = today.year === year;
          const isDisabled = yearBefore(year, min);
          return (
            <button
              key={year}
              type="button"
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => onPickYear(year)}
              className={cellClass(isSelected, isToday, isDisabled)}
            >
              {year}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * Which month to show first: the selected value's month, else today's — but
 * never a month that lies entirely before `min`. Opening an empty, bounded
 * picker on today's month would otherwise land the user in a grid where every
 * cell is dead; seeding on `min`'s month puts the first selectable day on
 * screen instead.
 */
function seedView(value: string, todayIso: string, min?: string): YM {
  const anchor = parseISODate(value) ?? parseISODate(todayIso);
  // `todayIso` is always a valid day, so `anchor` is never null in practice.
  const { year, month } = anchor!;
  if (monthBefore(year, month, min)) {
    const floor = parseISODate(min!);
    if (floor) return { year: floor.year, month: floor.month };
  }
  return { year, month };
}
