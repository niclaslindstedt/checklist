// Refreshing items: a repeat that carries **no due date**. "Buy milk every
// week or so" has a cadence but nothing to be late for, so instead of rolling
// a deadline it does the only thing that matters — checking it off puts it to
// rest, and once the cadence comes round the item returns unchecked at the top
// of its list, ready to be done again.
//
// The wait is stamped, not derived: `toggleItem` works out the instant the
// item is due back from its `Recurrence` and stores it on the item
// (`refreshAt`), and everything here is a comparison against that stamp. Two
// things fall out of that. The recurrence maths runs once, at check time,
// rather than on every pass; and the wait survives a reload, a device swap,
// and the markdown backend's round trip, because it is part of the document
// rather than a fact about this session.
//
// Two conventions, both borrowed from `reset-schedule.ts` next door:
//
//  - **Local time.** Unlike deadlines — timezone-free calendar days judged in
//    UTC — a refresh at "07:00" means seven in the morning where the user is,
//    so the calendar calculations here use the local-time `Date` accessors.
//    The module stays pure all the same: nothing reads the wall clock, every
//    function takes its `now` as an argument, and the only environmental
//    input is the process time zone (a fixed function of its inputs).
//
//  - **Catch-up fires once.** The app can only refresh an item while it is
//    running, so an item whose moment passed while the app was closed comes
//    back on the next open — once, however long it waited, because clearing
//    `refreshAt` is what ends the wait.

import { activeItems } from "./archive-ops.ts";
import { withChildren, withItems } from "./item-tree.ts";
import type {
  Checklist,
  ChecklistItem,
  ItemList,
  Recurrence,
  Snapshot,
} from "./types.ts";

/**
 * The time of day a fresh **daily** repeat proposes — 08:00 local, matching
 * the default a scheduled list reset offers. Only daily repeats carry a time
 * (see {@link Recurrence.at}); the coarser cadences come back at whatever
 * time of day the item was checked off.
 */
export const DEFAULT_REFRESH_TIME = "08:00";

/** `HH:MM`, 24-hour — the shape {@link Recurrence.at} is stored in. */
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * Whether an item's repeat is a **refresh** rather than a rolling due date:
 * it carries a `recurrence` and no `deadline`. Takes a structural shape so
 * the projections that carry only a subset of an item's fields can ask the
 * same question.
 */
export function isRefreshing(item: {
  recurrence?: Recurrence;
  deadline?: string;
}): boolean {
  return item.recurrence !== undefined && item.deadline === undefined;
}

/** A recurrence's interval, floored at one so a degenerate value can't stall. */
function stepOf(recurrence: Recurrence): number {
  return Math.max(1, Math.floor(recurrence.interval) || 1);
}

/** A recurrence's `at` time as `[hour, minute]`, or null when it carries none. */
function timeOf(recurrence: Recurrence): [number, number] | null {
  const m = recurrence.at ? TIME_RE.exec(recurrence.at) : null;
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return [hour, minute];
}

/**
 * The instant a refreshing item checked off at `from` is due back, as an
 * ISO-8601 instant: one whole interval on from `from`'s **local** day, at the
 * recurrence's `at` time when it has one and otherwise at the same time of
 * day it was checked.
 *
 * Counting from the check rather than from a fixed anchor is what makes
 * "every week or so" behave the way a shopping list wants: buying milk on
 * Thursday buys a week from Thursday, not a week from whenever the repeat was
 * first set. Month and year steps clamp the day of the month, so a chore
 * checked on the 31st comes back on the 30th of a shorter month rather than
 * spilling into the next one.
 */
export function nextRefreshAt(recurrence: Recurrence, from: string): string {
  const at = new Date(from);
  const y = at.getFullYear();
  const mo = at.getMonth();
  const d = at.getDate();
  const time = timeOf(recurrence);
  const hour = time ? time[0] : at.getHours();
  const minute = time ? time[1] : at.getMinutes();
  const step = stepOf(recurrence);
  switch (recurrence.unit) {
    case "day":
    case "week": {
      const days = (recurrence.unit === "week" ? 7 : 1) * step;
      // The `Date` constructor normalises an out-of-range day-of-month, so
      // walking past the end of a month (or across a DST change) is handled.
      return new Date(y, mo, d + days, hour, minute, 0, 0).toISOString();
    }
    case "month":
    case "year": {
      const months = (recurrence.unit === "year" ? 12 : 1) * step;
      // Day 0 of the following month is the last day of the target month.
      const lastDay = new Date(y, mo + months + 1, 0).getDate();
      return new Date(
        y,
        mo + months,
        Math.min(d, lastDay),
        hour,
        minute,
        0,
        0,
      ).toISOString();
    }
  }
}

/** One list's pending refreshes: the list and the items due back in it. */
export interface DueRefresh {
  checklist: Checklist;
  /** The items whose `refreshAt` has passed, in document order. */
  items: ChecklistItem[];
}

/** Whether a checked item's stamped wait has run out by `now`. */
function isDue(item: ChecklistItem, now: string): boolean {
  return item.checked && item.refreshAt !== undefined && item.refreshAt <= now;
}

/**
 * Every active (non-archived) checklist holding at least one item whose
 * refresh has come due by `now`, in document order — archived items sit the
 * pass out, since a refresh that surfaced one would drag it back into a list
 * the user has put away. Pure lookup; pair with {@link applyRefreshes}.
 */
export function dueRefreshes(snapshot: Snapshot, now: string): DueRefresh[] {
  const out: DueRefresh[] = [];
  for (const checklist of snapshot.checklists) {
    if (checklist.archived) continue;
    const items: ChecklistItem[] = [];
    const walk = (list: readonly ChecklistItem[]) => {
      for (const it of list) {
        if (isDue(it, now)) items.push(it);
        if (it.children) walk(it.children);
      }
    };
    // `activeItems` has already pruned the archived subtrees.
    walk(activeItems(checklist));
    if (items.length > 0) out.push({ checklist, items });
  }
  return out;
}

/**
 * Bring the named items back: uncheck each one, drop the stamps that recorded
 * the finished run (`checkedAt`, `refreshAt`), and hoist it to the head of its
 * own level so it leads the list it lives in — the top of the list for a
 * top-level item, the top of its category for one filed under a header, which
 * is where it will be looked for. Items sharing a level keep their relative
 * order. A no-op (no id in the tree) returns the same list untouched.
 */
export function refreshItems<L extends ItemList>(
  checklist: L,
  itemIds: readonly string[],
  now: string,
): L {
  const ids = new Set(itemIds);
  if (ids.size === 0) return checklist;
  let changed = false;
  const hoist = (list: readonly ChecklistItem[]): ChecklistItem[] => {
    const mapped = list.map((it) => {
      let next = it;
      if (ids.has(it.id)) {
        next = { ...it, checked: false };
        delete next.checkedAt;
        delete next.refreshAt;
        changed = true;
      }
      if (next.children) next = withChildren(next, hoist(next.children));
      return next;
    });
    if (!mapped.some((it) => ids.has(it.id))) return mapped;
    // Stable partition: the refreshed items lead, everything else follows in
    // its incoming order.
    return [
      ...mapped.filter((it) => ids.has(it.id)),
      ...mapped.filter((it) => !ids.has(it.id)),
    ];
  };
  const items = hoist(checklist.items);
  if (!changed) return checklist;
  return withItems(checklist, items, now);
}

/**
 * Apply a set of pending refreshes (from {@link dueRefreshes}) to the
 * document. Each named list gets its due items back; everything else is left
 * untouched. An empty set returns the same snapshot, so it never triggers a
 * write.
 */
export function applyRefreshes(
  snapshot: Snapshot,
  refreshes: readonly DueRefresh[],
  now: string,
): Snapshot {
  if (refreshes.length === 0) return snapshot;
  const byId = new Map(
    refreshes.map((r) => [r.checklist.id, r.items.map((it) => it.id)]),
  );
  return {
    ...snapshot,
    checklists: snapshot.checklists.map((c) => {
      const ids = byId.get(c.id);
      return ids ? refreshItems(c, ids, now) : c;
    }),
  };
}
