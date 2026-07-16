// Pure calendar-grid arithmetic backing the custom date picker. Like
// `deadlines.ts`, days are plain `YYYY-MM-DD` calendar days with no time zone,
// and every computation is a deterministic function of its arguments — the
// `Date` constructor is used only for UTC calendar math on given inputs, never
// `Date.now()`, so this module stays DOM-free and trivially testable (see
// AGENTS.md, "`src/domain/` is pure").

/** A single cell in a month grid — one day, flagged whether it falls in the
 *  month being shown or spills over from an adjacent month. */
export type DayCell = {
  /** The day as `YYYY-MM-DD`. */
  iso: string;
  /** Day of month, 1–31. */
  day: number;
  /** 1-based month this cell belongs to. */
  month: number;
  /** Full year this cell belongs to. */
  year: number;
  /** `true` when the cell is part of the month being displayed, `false` for a
   *  leading / trailing day borrowed from the previous / next month. */
  inMonth: boolean;
};

/** Zero-pad a number to two digits for a `YYYY-MM-DD` component. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a 1-based year / month / day triple as `YYYY-MM-DD`. */
export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Parse a `YYYY-MM-DD` day into a 1-based year / month / day triple, or
 *  `null` when the string is not a well-formed calendar day. */
export function parseISODate(
  iso: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Round-trip through a real date to reject impossible days (e.g. 2024-02-31).
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Shift a 1-based (year, month) by `delta` whole months, rolling the year. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  // Total months from year 0, then split back into a year and a 0-based month.
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/**
 * The first year of the fixed-size block that contains `year`, so the picker's
 * year grid pages through stable, non-overlapping ranges (…2004–2015,
 * 2016–2027, …) rather than a window that drifts with wherever you started.
 * `size` defaults to 12 (a 3×4 grid, matching the month grid's shape).
 */
export function yearRangeStart(year: number, size = 12): number {
  return year - (((year % size) + size) % size);
}

/** Day of week (0 = Sunday … 6 = Saturday) for a 1-based year / month / day. */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Number of days in a 1-based (year, month). */
function daysInMonth(year: number, month: number): number {
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Build the six-week grid a calendar renders for a month: 42 cells (6 rows of
 * 7), padded at the head and tail with days spilling in from the neighbouring
 * months so every row is full. `weekStartsOn` is the leftmost weekday column
 * (0 = Sunday, 1 = Monday, …), so the same month lays out differently under a
 * Sunday-first (en) vs. Monday-first (sv) locale.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  weekStartsOn: number,
): DayCell[][] {
  // How many leading cells belong to the previous month: the weekday of the
  // 1st, rotated so `weekStartsOn` sits at column 0.
  const firstWeekday = weekdayOf(year, month, 1);
  const lead = (firstWeekday - weekStartsOn + 7) % 7;

  const prev = addMonths(year, month, -1);
  const prevDays = daysInMonth(prev.year, prev.month);
  const thisDays = daysInMonth(year, month);
  const next = addMonths(year, month, 1);

  const cells: DayCell[] = [];
  // Leading days from the previous month.
  for (let i = lead; i > 0; i--) {
    const day = prevDays - i + 1;
    cells.push({
      iso: toISODate(prev.year, prev.month, day),
      day,
      month: prev.month,
      year: prev.year,
      inMonth: false,
    });
  }
  // The month itself.
  for (let day = 1; day <= thisDays; day++) {
    cells.push({
      iso: toISODate(year, month, day),
      day,
      month,
      year,
      inMonth: true,
    });
  }
  // Trailing days from the next month to fill the final row(s) out to 42.
  let day = 1;
  while (cells.length < 42) {
    cells.push({
      iso: toISODate(next.year, next.month, day),
      day,
      month: next.month,
      year: next.year,
      inMonth: false,
    });
    day++;
  }

  // Slice the flat run into weeks of seven.
  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}
