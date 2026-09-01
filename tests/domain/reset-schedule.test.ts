// Coverage for the scheduled-reset maths and verbs. Schedules resolve in
// local time, so every instant here is built with the local-time `Date`
// constructor and the expectations are derived the same way — the suite
// passes in any time zone rather than pinning one.
import { describe, expect, it } from "vitest";

import {
  applyResets,
  createChecklist,
  dueResetAt,
  dueResets,
  nextResetAt,
  resetChecklist,
  setResetSchedule,
} from "../../src/domain/checklists.ts";
import type {
  Checklist,
  ChecklistItem,
  ResetSchedule,
  Snapshot,
} from "../../src/domain/types.ts";

/** A local-time instant as ISO-8601. */
function at(y: number, m: number, d: number, h = 0, min = 0, s = 0): string {
  return new Date(y, m - 1, d, h, min, s, 0).toISOString();
}

function schedule(over: Partial<ResetSchedule> = {}): ResetSchedule {
  return {
    unit: "day",
    interval: 1,
    hour: 8,
    minute: 0,
    popUp: false,
    // A Monday morning, before the scheduled time.
    since: at(2026, 6, 1, 7, 0),
    ...over,
  };
}

function item(over: Partial<ChecklistItem> & { id: string }): ChecklistItem {
  return { title: over.id, checked: false, ...over };
}

function list(over: Partial<Checklist> = {}): Checklist {
  return {
    ...createChecklist("l1", "Leaving home", at(2026, 5, 1)),
    items: [
      item({ id: "keys", checked: true, checkedAt: at(2026, 6, 1) }),
      item({
        id: "bag",
        checked: true,
        children: [item({ id: "laptop", checked: true })],
      }),
      item({ id: "old", checked: true, archived: true }),
    ],
    ...over,
  };
}

describe("nextResetAt", () => {
  it("fires the same day when the schedule is set before its time", () => {
    expect(nextResetAt(schedule(), at(2026, 6, 1, 7, 0))).toBe(
      at(2026, 6, 1, 8, 0),
    );
  });

  it("fires the next day when the schedule is set after its time", () => {
    const s = schedule({ since: at(2026, 6, 1, 9, 0) });
    expect(nextResetAt(s, s.since)).toBe(at(2026, 6, 2, 8, 0));
  });

  it("steps every N days from the anchor day", () => {
    const s = schedule({ interval: 3 });
    expect(nextResetAt(s, at(2026, 6, 1, 8, 0))).toBe(at(2026, 6, 4, 8, 0));
    expect(nextResetAt(s, at(2026, 6, 5, 0, 0))).toBe(at(2026, 6, 7, 8, 0));
  });

  it("steps every N weeks", () => {
    const s = schedule({ unit: "week", interval: 2 });
    expect(nextResetAt(s, at(2026, 6, 1, 8, 0))).toBe(at(2026, 6, 15, 8, 0));
  });

  it("steps every N months, clamping the day of month", () => {
    const s = schedule({
      unit: "month",
      interval: 1,
      since: at(2026, 1, 31, 7, 0),
    });
    expect(nextResetAt(s, at(2026, 1, 31, 8, 0))).toBe(at(2026, 2, 28, 8, 0));
    expect(nextResetAt(s, at(2026, 2, 28, 8, 0))).toBe(at(2026, 3, 31, 8, 0));
  });

  it("fires on the next chosen weekday", () => {
    // 2026-06-01 is a Monday. Mon + Fri at 08:00.
    const s = schedule({ unit: "dayOfWeek", daysOfWeek: [1, 5] });
    expect(nextResetAt(s, at(2026, 6, 1, 8, 0))).toBe(at(2026, 6, 5, 8, 0));
    expect(nextResetAt(s, at(2026, 6, 5, 8, 0))).toBe(at(2026, 6, 8, 8, 0));
    // Later on a chosen day, still before its time, fires that day.
    expect(nextResetAt(s, at(2026, 6, 8, 7, 59))).toBe(at(2026, 6, 8, 8, 0));
  });

  it("never fires a weekday schedule with no weekdays", () => {
    const s = schedule({ unit: "dayOfWeek", daysOfWeek: [] });
    expect(nextResetAt(s, at(2026, 6, 1, 8, 0))).toBeNull();
  });

  it("treats a degenerate interval as one", () => {
    const s = schedule({ interval: 0 });
    expect(nextResetAt(s, at(2026, 6, 1, 8, 0))).toBe(at(2026, 6, 2, 8, 0));
  });
});

describe("dueResetAt", () => {
  it("is not due before the first occurrence", () => {
    expect(dueResetAt(schedule(), undefined, at(2026, 6, 1, 7, 59))).toBeNull();
  });

  it("is due at the occurrence and stays due until applied", () => {
    expect(dueResetAt(schedule(), undefined, at(2026, 6, 1, 8, 0))).toBe(
      at(2026, 6, 1, 8, 0),
    );
    expect(dueResetAt(schedule(), undefined, at(2026, 6, 1, 23, 0))).toBe(
      at(2026, 6, 1, 8, 0),
    );
  });

  it("is not due again once that occurrence has been applied", () => {
    const applied = at(2026, 6, 1, 8, 0);
    expect(dueResetAt(schedule(), applied, at(2026, 6, 1, 23, 0))).toBeNull();
    // …but the next day's occurrence is.
    expect(dueResetAt(schedule(), applied, at(2026, 6, 2, 8, 0))).toBe(
      at(2026, 6, 2, 8, 0),
    );
  });

  it("collapses several missed occurrences into the latest one", () => {
    // A week away: only the most recent morning counts.
    expect(dueResetAt(schedule(), undefined, at(2026, 6, 8, 12, 0))).toBe(
      at(2026, 6, 8, 8, 0),
    );
  });

  it("skips the anchor day's occurrence when the schedule was set after it", () => {
    const s = schedule({ since: at(2026, 6, 1, 9, 0) });
    expect(dueResetAt(s, undefined, at(2026, 6, 1, 23, 0))).toBeNull();
    expect(dueResetAt(s, undefined, at(2026, 6, 2, 8, 0))).toBe(
      at(2026, 6, 2, 8, 0),
    );
  });

  it("keeps a multi-day cadence anchored on the day it was set", () => {
    const s = schedule({ interval: 2 });
    // Mon 08:00 fires; Tue has nothing; Wed 08:00 fires.
    expect(dueResetAt(s, undefined, at(2026, 6, 1, 8, 0))).toBe(
      at(2026, 6, 1, 8, 0),
    );
    expect(
      dueResetAt(s, at(2026, 6, 1, 8, 0), at(2026, 6, 2, 23, 0)),
    ).toBeNull();
    expect(dueResetAt(s, at(2026, 6, 1, 8, 0), at(2026, 6, 3, 8, 0))).toBe(
      at(2026, 6, 3, 8, 0),
    );
  });

  it("finds the latest chosen weekday within the past week", () => {
    // Mon + Wed; opened on Friday evening → Wednesday's occurrence is due.
    const s = schedule({ unit: "dayOfWeek", daysOfWeek: [1, 3] });
    expect(dueResetAt(s, undefined, at(2026, 6, 5, 20, 0))).toBe(
      at(2026, 6, 3, 8, 0),
    );
    // Applied; nothing more until Monday.
    expect(
      dueResetAt(s, at(2026, 6, 3, 8, 0), at(2026, 6, 7, 23, 59)),
    ).toBeNull();
    expect(dueResetAt(s, at(2026, 6, 3, 8, 0), at(2026, 6, 8, 8, 0))).toBe(
      at(2026, 6, 8, 8, 0),
    );
  });

  it("respects the minute of the scheduled time", () => {
    const s = schedule({ hour: 7, minute: 30 });
    expect(dueResetAt(s, undefined, at(2026, 6, 1, 7, 29))).toBeNull();
    expect(dueResetAt(s, undefined, at(2026, 6, 1, 7, 30))).toBe(
      at(2026, 6, 1, 7, 30),
    );
  });
});

describe("resetChecklist", () => {
  it("unchecks every active item, sub-items included, and stamps the occurrence", () => {
    const resetAt = at(2026, 6, 1, 8, 0);
    const now = at(2026, 6, 1, 9, 0);
    const next = resetChecklist(list(), resetAt, now);
    expect(next.items[0]!.checked).toBe(false);
    expect(next.items[0]!.checkedAt).toBeUndefined();
    expect(next.items[1]!.checked).toBe(false);
    expect(next.items[1]!.children![0]!.checked).toBe(false);
    // Archived items are hidden, so the sweep leaves them alone.
    expect(next.items[2]!.checked).toBe(true);
    expect(next.lastResetAt).toBe(resetAt);
    expect(next.updatedAt).toBe(now);
  });

  it("still stamps the occurrence on a list with nothing checked", () => {
    const clean = list({ items: [item({ id: "a" })] });
    const next = resetChecklist(clean, at(2026, 6, 1, 8, 0), at(2026, 6, 1, 9));
    expect(next).not.toBe(clean);
    expect(next.lastResetAt).toBe(at(2026, 6, 1, 8, 0));
  });
});

describe("setResetSchedule", () => {
  it("stamps the anchor with now and clears an earlier last reset", () => {
    const scheduled = list({ lastResetAt: at(2026, 5, 20, 8, 0) });
    const now = at(2026, 6, 1, 7, 0);
    const next = setResetSchedule(
      scheduled,
      { unit: "week", interval: 2, hour: 7, minute: 30, popUp: true },
      now,
    );
    expect(next.resetSchedule).toEqual({
      unit: "week",
      interval: 2,
      hour: 7,
      minute: 30,
      popUp: true,
      since: now,
    });
    expect(next.lastResetAt).toBeUndefined();
    expect(next.updatedAt).toBe(now);
  });

  it("keeps the weekdays sorted and deduped, and floors the interval", () => {
    const next = setResetSchedule(
      list(),
      {
        unit: "dayOfWeek",
        interval: 0,
        daysOfWeek: [5, 1, 5, 3],
        hour: 8,
        minute: 0,
        popUp: false,
      },
      at(2026, 6, 1),
    );
    expect(next.resetSchedule?.daysOfWeek).toEqual([1, 3, 5]);
    expect(next.resetSchedule?.interval).toBe(1);
  });

  it("drops the weekdays when the unit is not weekday-based", () => {
    const next = setResetSchedule(
      list(),
      {
        unit: "day",
        interval: 1,
        daysOfWeek: [1],
        hour: 8,
        minute: 0,
        popUp: false,
      },
      at(2026, 6, 1),
    );
    expect(next.resetSchedule).not.toHaveProperty("daysOfWeek");
  });

  it("clears the schedule and the last reset together", () => {
    const scheduled = list({
      resetSchedule: schedule(),
      lastResetAt: at(2026, 6, 1, 8, 0),
    });
    const next = setResetSchedule(scheduled, null, at(2026, 6, 2));
    expect(next).not.toHaveProperty("resetSchedule");
    expect(next).not.toHaveProperty("lastResetAt");
  });

  it("is a no-op clear on an unscheduled list", () => {
    const plain = list();
    expect(setResetSchedule(plain, null, at(2026, 6, 2))).toBe(plain);
  });
});

describe("dueResets / applyResets", () => {
  function snapshot(lists: Checklist[]): Snapshot {
    return { templates: [], checklists: lists };
  }

  it("finds every active scheduled list that has come due", () => {
    const due = list({ id: "due", resetSchedule: schedule() });
    const later = list({
      id: "later",
      resetSchedule: schedule({ hour: 20 }),
    });
    const archived = list({
      id: "archived",
      archived: true,
      resetSchedule: schedule(),
    });
    const unscheduled = list({ id: "plain" });
    const found = dueResets(
      snapshot([due, later, archived, unscheduled]),
      at(2026, 6, 1, 9, 0),
    );
    expect(found.map((d) => d.checklist.id)).toEqual(["due"]);
    expect(found[0]!.resetAt).toBe(at(2026, 6, 1, 8, 0));
  });

  it("applies only the named resets and leaves the rest untouched", () => {
    const due = list({ id: "due", resetSchedule: schedule() });
    const other = list({ id: "other" });
    const doc = snapshot([due, other]);
    const now = at(2026, 6, 1, 9, 0);
    const next = applyResets(doc, dueResets(doc, now), now);
    expect(next.checklists[0]!.items[0]!.checked).toBe(false);
    expect(next.checklists[0]!.lastResetAt).toBe(at(2026, 6, 1, 8, 0));
    expect(next.checklists[1]).toBe(other);
    // Applied — a second pass finds nothing.
    expect(dueResets(next, now)).toEqual([]);
  });

  it("returns the same snapshot when nothing is due", () => {
    const doc = snapshot([list({ resetSchedule: schedule() })]);
    expect(applyResets(doc, [], at(2026, 6, 1, 7, 0))).toBe(doc);
  });
});
