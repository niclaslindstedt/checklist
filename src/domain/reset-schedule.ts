// Scheduled resets: when a checklist wipes its own checkmarks so a recurring
// routine (leaving the house, closing up shop) starts fresh each time. A
// `ResetSchedule` on a `Checklist` says how often and at what time of day; the
// functions here work out *which* occurrence is due against a "now" instant,
// and apply the reset itself (unchecking every active item, via
// `setAllChecked`).
//
// Two conventions worth stating up front:
//
//  - **Local time.** Unlike deadlines — timezone-free calendar days judged in
//    UTC — a reset at "08:00" means eight in the morning where the user is,
//    so every calendar calculation here uses the local-time `Date` accessors.
//    The module stays pure all the same: nothing reads the wall clock, every
//    function takes its `now` as an argument, and the only environmental
//    input is the process time zone (a fixed function of its inputs).
//
//  - **Catch-up fires once.** The app can only reset a list while it is
//    open, so a schedule that came due while the app was closed is applied on
//    the next open — but a list that missed several occurrences is reset once,
//    against the *latest* missed one, not once per missed day. `lastResetAt`
//    records that occurrence so it is never applied twice.

import { setAllChecked } from "./item-ops.ts";
import type {
  Checklist,
  ResetSchedule,
  ResetSchedulePatch,
  Snapshot,
} from "./types.ts";

/** The default time of day a fresh schedule falls due: 08:00. */
export const DEFAULT_RESET_HOUR = 8;
export const DEFAULT_RESET_MINUTE = 0;

/** Weekday indices (`0` = Sunday … `6` = Saturday), Monday first — the order a picker lists them. */
export const WEEKDAYS_MONDAY_FIRST: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/** Monday to Friday — what a fresh "days of the week" schedule preselects. */
export const DEFAULT_DAYS_OF_WEEK: readonly number[] = [1, 2, 3, 4, 5];

/** Milliseconds in one day (for whole-day arithmetic over UTC day numbers). */
const DAY_MS = 86_400_000;

/** A local calendar day, split into its parts. */
type LocalDay = { y: number; m: number; d: number };

function localDayOf(ms: number): LocalDay {
  const dt = new Date(ms);
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

/** The instant (ms) of `hour:minute` local time on a local day, `delta` days on. */
function instantOn(
  day: LocalDay,
  delta: number,
  hour: number,
  minute: number,
): number {
  // The `Date` constructor normalises an out-of-range day-of-month, so
  // walking past the end of a month (or across a DST change) is handled.
  return new Date(day.y, day.m, day.d + delta, hour, minute, 0, 0).getTime();
}

/** Whole calendar days from `a` to `b` (local days, DST-safe via UTC day numbers). */
function daysBetween(a: LocalDay, b: LocalDay): number {
  return Math.round(
    (Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / DAY_MS,
  );
}

/** The instant `k * interval` months after the anchor day, day-of-month clamped. */
function monthOccurrence(
  anchor: LocalDay,
  months: number,
  hour: number,
  minute: number,
): number {
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(anchor.y, anchor.m + months + 1, 0).getDate();
  return new Date(
    anchor.y,
    anchor.m + months,
    Math.min(anchor.d, lastDay),
    hour,
    minute,
    0,
    0,
  ).getTime();
}

/** A schedule's interval, floored at one so a degenerate value can't stall the walk. */
function stepOf(schedule: ResetSchedule): number {
  return Math.max(1, Math.floor(schedule.interval) || 1);
}

/**
 * The `k`-th occurrence (k >= 0) of an interval-based schedule, counted from
 * the local day the schedule was set: the anchor day itself at the scheduled
 * time is occurrence 0, then every `interval` days / weeks / months after it.
 */
function occurrence(schedule: ResetSchedule, k: number): number {
  const anchor = localDayOf(new Date(schedule.since).getTime());
  const { hour, minute } = schedule;
  switch (schedule.unit) {
    case "day":
      return instantOn(anchor, k * stepOf(schedule), hour, minute);
    case "week":
      return instantOn(anchor, k * 7 * stepOf(schedule), hour, minute);
    case "month":
      return monthOccurrence(anchor, k * stepOf(schedule), hour, minute);
    case "dayOfWeek":
      // Weekday schedules aren't indexed — see `latestWeekdayAtOrBefore`.
      throw new Error("occurrence() is only defined for interval schedules");
  }
}

/**
 * The index of the latest interval-schedule occurrence at or before `at`
 * (ms), or -1 when the first occurrence is still ahead. Computed
 * arithmetically from the day / month distance, then nudged back if the
 * candidate lands later in its day than `at`.
 */
function latestIndexAtOrBefore(schedule: ResetSchedule, at: number): number {
  const anchor = localDayOf(new Date(schedule.since).getTime());
  const today = localDayOf(at);
  let k: number;
  if (schedule.unit === "month") {
    const months = (today.y - anchor.y) * 12 + (today.m - anchor.m);
    k = Math.floor(months / stepOf(schedule));
  } else {
    const perStep =
      schedule.unit === "week" ? 7 * stepOf(schedule) : stepOf(schedule);
    k = Math.floor(daysBetween(anchor, today) / perStep);
  }
  if (k < 0) return -1;
  // The estimate can overshoot by one when the candidate falls later in its
  // day than `at`; never by more, since consecutive occurrences are at least
  // a day apart. The loop is a guard, not a walk.
  while (k >= 0 && occurrence(schedule, k) > at) k -= 1;
  return k;
}

/** The weekdays a `dayOfWeek` schedule fires on, deduped and range-checked. */
function weekdaysOf(schedule: ResetSchedule): Set<number> {
  const out = new Set<number>();
  for (const d of schedule.daysOfWeek ?? []) {
    if (Number.isInteger(d) && d >= 0 && d <= 6) out.add(d);
  }
  return out;
}

/** The latest weekday-schedule occurrence at or before `at`, or null with no weekdays chosen. */
function latestWeekdayAtOrBefore(
  schedule: ResetSchedule,
  at: number,
): number | null {
  const days = weekdaysOf(schedule);
  if (days.size === 0) return null;
  const today = localDayOf(at);
  for (let back = 0; back < 7; back++) {
    const candidate = instantOn(today, -back, schedule.hour, schedule.minute);
    if (candidate > at) continue;
    if (days.has(new Date(candidate).getDay())) return candidate;
  }
  return null;
}

/** The latest occurrence of any schedule at or before `at` (ms), or null. */
function latestAtOrBefore(schedule: ResetSchedule, at: number): number | null {
  if (schedule.unit === "dayOfWeek") {
    return latestWeekdayAtOrBefore(schedule, at);
  }
  const k = latestIndexAtOrBefore(schedule, at);
  return k < 0 ? null : occurrence(schedule, k);
}

/**
 * The first occurrence strictly after `after` (an ISO-8601 instant), as an
 * ISO-8601 instant — what the schedule modal shows as "next reset". Null for a
 * weekday schedule with no weekdays chosen, which never fires.
 */
export function nextResetAt(
  schedule: ResetSchedule,
  after: string,
): string | null {
  const at = new Date(after).getTime();
  if (schedule.unit === "dayOfWeek") {
    const days = weekdaysOf(schedule);
    if (days.size === 0) return null;
    const today = localDayOf(at);
    for (let ahead = 0; ahead <= 7; ahead++) {
      const candidate = instantOn(today, ahead, schedule.hour, schedule.minute);
      if (candidate <= at) continue;
      if (days.has(new Date(candidate).getDay())) {
        return new Date(candidate).toISOString();
      }
    }
    return null;
  }
  const k = latestIndexAtOrBefore(schedule, at);
  return new Date(occurrence(schedule, k + 1)).toISOString();
}

/**
 * The occurrence a list is due to be reset against right now, or null when
 * nothing is pending: the latest occurrence at or before `now` that falls
 * after the last one applied (`lastResetAt`), or after the schedule was set
 * when it has never fired. Several missed occurrences collapse into the
 * latest one, so a list opened after a week away resets once, not seven
 * times. Returns the occurrence's ISO-8601 instant — what `resetChecklist`
 * stamps as the new `lastResetAt`.
 */
export function dueResetAt(
  schedule: ResetSchedule,
  lastResetAt: string | undefined,
  now: string,
): string | null {
  const latest = latestAtOrBefore(schedule, new Date(now).getTime());
  if (latest === null) return null;
  const floor = new Date(lastResetAt ?? schedule.since).getTime();
  return latest > floor ? new Date(latest).toISOString() : null;
}

/**
 * Apply one scheduled reset to a checklist: uncheck every active item (the
 * same sweep as the header's "Uncheck all" — archived subtrees and the checked
 * state of nothing else are touched) and record the occurrence it was applied
 * against. Always returns a new list, even when nothing was checked: the
 * `lastResetAt` stamp is what stops the same occurrence firing again.
 */
export function resetChecklist(
  checklist: Checklist,
  resetAt: string,
  now: string,
): Checklist {
  const cleared = setAllChecked(checklist, false, now);
  return { ...cleared, lastResetAt: resetAt, updatedAt: now };
}

/**
 * Set or clear a checklist's reset schedule. Setting one stamps `since` with
 * `now` (the cadence counts from today) and drops any earlier `lastResetAt`,
 * so an edited schedule starts afresh rather than inheriting the old
 * cadence's last fire. Clearing drops both fields. A no-op clear (nothing was
 * scheduled) returns the same list untouched, so it never triggers a write.
 */
export function setResetSchedule(
  checklist: Checklist,
  patch: ResetSchedulePatch | null,
  now: string,
): Checklist {
  if (patch === null) {
    if (!checklist.resetSchedule && !checklist.lastResetAt) return checklist;
    const next = { ...checklist, updatedAt: now };
    delete next.resetSchedule;
    delete next.lastResetAt;
    return next;
  }
  const schedule: ResetSchedule = {
    unit: patch.unit,
    interval: Math.max(1, Math.floor(patch.interval) || 1),
    hour: patch.hour,
    minute: patch.minute,
    popUp: patch.popUp,
    since: now,
  };
  if (patch.unit === "dayOfWeek") {
    schedule.daysOfWeek = [...new Set(patch.daysOfWeek ?? [])].sort(
      (a, b) => a - b,
    );
  }
  const next = { ...checklist, resetSchedule: schedule, updatedAt: now };
  delete next.lastResetAt;
  return next;
}

/** One pending reset: the list and the occurrence it is due against. */
export interface DueReset {
  checklist: Checklist;
  resetAt: string;
}

/**
 * Every active (non-archived) scheduled checklist whose reset has come due
 * by `now`, in document order. Pure lookup — pair with `applyResets`.
 */
export function dueResets(snapshot: Snapshot, now: string): DueReset[] {
  const out: DueReset[] = [];
  for (const checklist of snapshot.checklists) {
    if (checklist.archived || !checklist.resetSchedule) continue;
    const resetAt = dueResetAt(
      checklist.resetSchedule,
      checklist.lastResetAt,
      now,
    );
    if (resetAt) out.push({ checklist, resetAt });
  }
  return out;
}

/**
 * Apply a set of due resets (from `dueResets`) to the document. Each named
 * list is reset against its occurrence; everything else is left untouched. An
 * empty set returns the same snapshot, so it never triggers a write.
 */
export function applyResets(
  snapshot: Snapshot,
  resets: readonly DueReset[],
  now: string,
): Snapshot {
  if (resets.length === 0) return snapshot;
  const byId = new Map(resets.map((r) => [r.checklist.id, r.resetAt]));
  return {
    ...snapshot,
    checklists: snapshot.checklists.map((c) => {
      const resetAt = byId.get(c.id);
      return resetAt ? resetChecklist(c, resetAt, now) : c;
    }),
  };
}
