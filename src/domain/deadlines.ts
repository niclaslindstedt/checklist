// Pure date arithmetic over item deadlines: how soon a due date is (the
// colour bucket the date row paints with) and how a recurring deadline rolls
// forward. Deadlines are plain `YYYY-MM-DD` calendar days with no time zone,
// and every function takes the "now" instant explicitly, so this module stays
// deterministic and DOM-free like the rest of `domain/` (see AGENTS.md). The
// `Date` constructor is used only for UTC calendar math on those given
// inputs — never `Date.now()` — so results depend solely on the arguments.

import type { Recurrence } from "./types.ts";

/**
 * How urgent a deadline is, relative to today:
 * - `overdue`   — the due date has passed (paint it red).
 * - `due-soon`  — due today or tomorrow (orange).
 * - `upcoming`  — due within a week (yellow).
 * - `later`     — more than a week out (muted, no warmth).
 */
export type DeadlineStatus = "overdue" | "due-soon" | "upcoming" | "later";

/** Days since the Unix epoch for a `YYYY-MM-DD` day (UTC midnight). */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

/** Zero-pad a number to two digits for a `YYYY-MM-DD` component. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a UTC year / (1-based) month / day triple as `YYYY-MM-DD`. */
function formatDay(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Whole calendar days from the `now` instant's date to `deadline` — negative
 * when the deadline is in the past, 0 when it falls today. `now` is a full
 * ISO timestamp; only its `YYYY-MM-DD` head matters.
 */
export function daysUntil(deadline: string, now: string): number {
  return dayNumber(deadline) - dayNumber(now.slice(0, 10));
}

/** Bucket a deadline into its urgency band relative to `now`. */
export function deadlineStatus(deadline: string, now: string): DeadlineStatus {
  const days = daysUntil(deadline, now);
  if (days < 0) return "overdue";
  if (days <= 1) return "due-soon";
  if (days <= 7) return "upcoming";
  return "later";
}

/**
 * Advance a `YYYY-MM-DD` day by one recurrence interval. Weeks add
 * `interval * 7` days; months and years shift the month / year and clamp the
 * day of month so the 31st + one month lands on the shorter month's last day
 * (and Feb 29 + one year on Feb 28).
 */
export function addRecurrence(
  deadline: string,
  recurrence: Recurrence,
): string {
  const [y, m, d] = deadline.split("-").map(Number);
  if (recurrence.unit === "week") {
    const dt = new Date(Date.UTC(y!, m! - 1, d! + recurrence.interval * 7));
    return formatDay(
      dt.getUTCFullYear(),
      dt.getUTCMonth() + 1,
      dt.getUTCDate(),
    );
  }
  const monthsToAdd =
    recurrence.unit === "year" ? recurrence.interval * 12 : recurrence.interval;
  // Total months from year 0, then split back into a year and a 0-based month.
  const total = y! * 12 + (m! - 1) + monthsToAdd;
  const ny = Math.floor(total / 12);
  const nm = total % 12; // 0-based
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return formatDay(ny, nm + 1, Math.min(d!, lastDay));
}

/**
 * The next occurrence of a recurring deadline strictly after today: roll the
 * date forward by whole intervals until it lands beyond `now`'s date, so a
 * deadline missed by several periods still lands on a future one on its own
 * cadence rather than back in the past.
 */
export function nextOccurrence(
  deadline: string,
  recurrence: Recurrence,
  now: string,
): string {
  const today = dayNumber(now.slice(0, 10));
  let next = addRecurrence(deadline, recurrence);
  // Guard the loop against a degenerate interval so it can't spin forever.
  let guard = 0;
  while (dayNumber(next) <= today && guard < 1000) {
    next = addRecurrence(next, recurrence);
    guard++;
  }
  return next;
}
