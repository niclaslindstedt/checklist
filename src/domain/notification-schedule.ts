// The compact, forward-looking projection of a checklist document that the
// native wrapper turns into local OS notifications. Like the widget snapshot
// (`domain/widget-snapshot.ts`), notifications run outside the WebView — the
// OS fires them whether or not the app is open — so the app mirrors a derived
// schedule of *upcoming* deadline reminders out to the native side on every
// persist, and the wrapper (re)schedules `expo-notifications` from it. See the
// notifications work in #268.
//
// This is a *derived* view: the WebView's storage stays the single source of
// truth. The schedule carries only what the OS needs to fire one reminder —
// when to fire, which item it points at (for the deep link), and the localised
// text — so a stale schedule can never corrupt the document.
//
// Pure, like the rest of `domain/`: the caller supplies the `now` instant and
// the text formatter, so the output depends solely on the arguments — no DOM,
// no i18n, no clock. Three behaviours worth calling out:
//
//  - **Reminders fire at a fixed hour, in UTC.** Deadlines are timezone-free
//    `YYYY-MM-DD` calendar days throughout the app (see `deadlines.ts`), and
//    "due today" is already judged against `now`'s UTC date (see the widget
//    snapshot). We keep that convention: a reminder for day `D` fires at
//    `D`T`REMINDER_HOUR`:00Z. A per-timezone / user-chosen reminder time can
//    layer on later without changing the wire shape.
//
//  - **Lead times fire several reminders per deadline.** `leadDays` is the set
//    of "how many days before the due day" offsets to remind on — `[0]` is
//    just the morning it's due, `[0, 1]` adds the day before, `[0, 1, 7]` adds
//    a week's notice. Each offset that still lands in the future becomes its
//    own reminder, so one dated item can raise a short series. (Deadlines carry
//    no time of day, so sub-day "an hour before" lead times aren't expressible
//    until deadlines gain a time.)
//
//  - **Recurring deadlines emit several occurrences ahead.** The OS can't ask
//    the app to re-arm a repeat while the app is closed, so for a recurring
//    item we schedule the next few occurrences up front (`occurrencesAhead`).
//    Even if the user doesn't open the app for a cycle or two, the upcoming
//    reminders are already armed; each fresh mirror tops the window back up.

import { activeItems } from "./archive-ops.ts";
import { addRecurrence, daysUntil } from "./deadlines.ts";
import { flattenItems } from "./item-tree.ts";
import type { ChecklistItem, Snapshot } from "./types.ts";

/** The current notification-schedule format version, bumped on a breaking shape change. */
export const NOTIFICATION_SCHEDULE_VERSION = 1 as const;

/** The UTC hour of day a deadline reminder fires (09:00Z). */
export const DEFAULT_REMINDER_HOUR = 9;

/** The lead-time offsets (days before the due day) reminded on by default: just the day itself. */
export const DEFAULT_LEAD_DAYS: readonly number[] = [0];

/**
 * The lead-time offsets the settings UI lets a user pick from — the day itself,
 * the day before, and a week before. Kept here (not in the UI) so the domain,
 * the settings validator, and the picker agree on the allowed set.
 */
export const ALLOWED_LEAD_DAYS: readonly number[] = [0, 1, 7];

/** How many future occurrences of a recurring deadline to arm up front. */
export const DEFAULT_OCCURRENCES_AHEAD = 3;

/**
 * The most notifications a single schedule carries. iOS caps an app at 64
 * pending local notifications; we stay well under so the soonest reminders are
 * never dropped by the OS silently truncating the tail.
 */
export const MAX_NOTIFICATIONS = 60;

/** The localised text one reminder shows. */
export interface NotificationText {
  title: string;
  body: string;
}

/** What the formatter needs to phrase one reminder. */
export interface NotificationContext {
  /** The item's title. */
  itemTitle: string;
  /** The name of the list the item lives in. */
  listName: string;
  /** The due day (`YYYY-MM-DD`) this reminder is for. */
  deadline: string;
  /** Whole days from the reminder's fire day to the due day (0 = due that day). */
  daysUntilDue: number;
}

/** Phrases one reminder's title + body. Injected so this module stays i18n-free. */
export type NotificationFormatter = (
  ctx: NotificationContext,
) => NotificationText;

/** One local notification the native side should have scheduled. */
export interface ScheduledNotification {
  /**
   * A stable id derived from the item, the due day, and the lead offset — so
   * the same reminder keeps its identity across republishes and the native
   * side can cancel-and-replace deterministically rather than piling up
   * duplicates.
   */
  id: string;
  /** The list the item lives in — echoed into the tap deep link. */
  listId: string;
  /** The item the reminder points at — echoed into the tap deep link. */
  itemId: string;
  /** When the OS should fire the reminder (ISO-8601 UTC). */
  fireAt: string;
  title: string;
  body: string;
}

/** The whole schedule the native side (re)arms from. */
export interface NotificationSchedule {
  version: typeof NOTIFICATION_SCHEDULE_VERSION;
  /** When the schedule was built (ISO-8601) — the freshness the wrapper logs. */
  updatedAt: string;
  /** Upcoming reminders, soonest first, capped at {@link MAX_NOTIFICATIONS}. */
  notifications: ScheduledNotification[];
}

/** Options for {@link buildNotificationSchedule}. */
export interface NotificationScheduleOptions {
  /** The "now" instant (ISO-8601) — reminders strictly after it are kept. */
  now: string;
  /** When true, produce an empty schedule (the user opted out). */
  disabled?: boolean;
  /** The UTC hour a reminder fires (default {@link DEFAULT_REMINDER_HOUR}). */
  reminderHour?: number;
  /** Days-before-due offsets to remind on (default {@link DEFAULT_LEAD_DAYS}). */
  leadDays?: readonly number[];
  /** How many occurrences ahead to arm a recurring deadline (default {@link DEFAULT_OCCURRENCES_AHEAD}). */
  occurrencesAhead?: number;
  /** Cap on total notifications (default {@link MAX_NOTIFICATIONS}). */
  limit?: number;
  /** Phrases each reminder; defaults to plain English when omitted. */
  format?: NotificationFormatter;
}

/** Zero-pad a number to two digits. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A `YYYY-MM-DD` day shifted by `delta` whole days (UTC calendar math). */
function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** The ISO-8601 UTC instant a reminder for `day` fires at `hour`. */
function fireInstant(day: string, hour: number): string {
  return `${day}T${pad(hour)}:00:00.000Z`;
}

/** The plain-English fallback text when no formatter is supplied. */
function defaultFormat(ctx: NotificationContext): NotificationText {
  const body =
    ctx.daysUntilDue <= 0
      ? `Due today in ${ctx.listName}`
      : ctx.daysUntilDue === 1
        ? `Due tomorrow in ${ctx.listName}`
        : `Due in ${ctx.daysUntilDue} days in ${ctx.listName}`;
  return { title: ctx.itemTitle, body };
}

/** Normalise a lead-days set: keep valid non-negative offsets, dedupe, sort. */
function normaliseLeadDays(leadDays: readonly number[]): number[] {
  const seen = new Set<number>();
  for (const d of leadDays) {
    if (Number.isInteger(d) && d >= 0) seen.add(d);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * The future due days a dated item should fire reminders for, in chronological
 * order. A one-off item contributes its own deadline (only if its own day-of
 * reminder is still ahead of `now`); a recurring item contributes up to
 * `count` occurrences whose day-of reminder is still ahead, rolling forward on
 * its own cadence — so a long-missed recurring task arms its next real
 * occurrences rather than a pile of past ones.
 */
export function futureDueDays(
  item: Pick<ChecklistItem, "deadline" | "recurrence">,
  now: string,
  hour: number,
  count: number,
): string[] {
  if (!item.deadline) return [];
  if (!item.recurrence) {
    return fireInstant(item.deadline, hour) > now ? [item.deadline] : [];
  }
  const days: string[] = [];
  let day = item.deadline;
  // Guard the walk against a degenerate interval so it can't spin forever.
  let guard = 0;
  const maxIterations = count + 1000;
  while (days.length < count && guard < maxIterations) {
    guard++;
    if (fireInstant(day, hour) > now) days.push(day);
    day = addRecurrence(day, item.recurrence);
  }
  return days;
}

/**
 * Build the notification schedule from the full document. Skips archived lists
 * and items, and any item that is checked or undated; within each list it spans
 * the visible tree, sub-items included. For every future due day it fires one
 * reminder per configured lead offset that still lands in the future (the OS
 * can't fire one in the past), sorted soonest-first and capped.
 */
export function buildNotificationSchedule(
  doc: Snapshot,
  options: NotificationScheduleOptions,
): NotificationSchedule {
  const {
    now,
    disabled = false,
    reminderHour = DEFAULT_REMINDER_HOUR,
    occurrencesAhead = DEFAULT_OCCURRENCES_AHEAD,
    limit = MAX_NOTIFICATIONS,
    format = defaultFormat,
  } = options;
  const leadDays = normaliseLeadDays(options.leadDays ?? DEFAULT_LEAD_DAYS);

  if (disabled || leadDays.length === 0) {
    return {
      version: NOTIFICATION_SCHEDULE_VERSION,
      updatedAt: now,
      notifications: [],
    };
  }

  const notifications: ScheduledNotification[] = [];
  for (const list of doc.checklists) {
    if (list.archived) continue;
    for (const item of flattenItems(activeItems(list))) {
      if (item.checked || !item.deadline) continue;
      for (const dueDay of futureDueDays(
        item,
        now,
        reminderHour,
        occurrencesAhead,
      )) {
        for (const lead of leadDays) {
          const fireDay = shiftDay(dueDay, -lead);
          const fireAt = fireInstant(fireDay, reminderHour);
          if (fireAt <= now) continue;
          // Days from the fire day to the due day; clamps to 0 so a due-day
          // reminder that lands slightly behind `now` still reads as "today".
          const remaining = Math.max(0, daysUntil(dueDay, fireAt));
          const text = format({
            itemTitle: item.title,
            listName: list.name,
            deadline: dueDay,
            daysUntilDue: remaining,
          });
          notifications.push({
            id: `${list.id}:${item.id}:${dueDay}:${lead}`,
            listId: list.id,
            itemId: item.id,
            fireAt,
            title: text.title,
            body: text.body,
          });
        }
      }
    }
  }

  // Soonest first; ties keep document order (stable sort). Cap to the limit so
  // the nearest reminders survive when a document has more than the OS allows.
  notifications.sort((a, b) => a.fireAt.localeCompare(b.fireAt));

  return {
    version: NOTIFICATION_SCHEDULE_VERSION,
    updatedAt: now,
    notifications: notifications.slice(0, limit),
  };
}

/**
 * Whether the document has any dated, unchecked, non-archived item at all —
 * regardless of whether its reminder is still in the future. Drives the
 * permission-prompt timing: the wrapper asks for notification permission the
 * first time a document gains a deadline, not on first launch.
 */
export function documentHasDeadline(doc: Snapshot): boolean {
  for (const list of doc.checklists) {
    if (list.archived) continue;
    for (const item of flattenItems(activeItems(list))) {
      if (!item.checked && item.deadline) return true;
    }
  }
  return false;
}
