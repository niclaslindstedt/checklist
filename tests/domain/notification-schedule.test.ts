import { describe, expect, it } from "vitest";

import type {
  Checklist,
  ChecklistItem,
  Snapshot,
} from "../../src/domain/types.ts";
import {
  buildNotificationSchedule,
  documentHasDeadline,
  futureDueDays,
  MAX_NOTIFICATIONS,
  NOTIFICATION_SCHEDULE_VERSION,
} from "../../src/domain/notification-schedule.ts";

// Fixed "now" so every schedule is deterministic — noon on 2026-07-15.
const NOW = "2026-07-15T12:00:00.000Z";

function item(partial: Partial<ChecklistItem> & { id: string }): ChecklistItem {
  return { title: partial.id, checked: false, ...partial };
}

function list(partial: Partial<Checklist> & { id: string }): Checklist {
  return {
    version: 1,
    templateId: "",
    name: partial.id,
    items: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function snapshot(checklists: Checklist[]): Snapshot {
  return { templates: [], checklists };
}

describe("buildNotificationSchedule", () => {
  it("schedules a future one-off deadline at the reminder hour (UTC)", () => {
    const doc = snapshot([
      list({
        id: "a",
        name: "Trip",
        items: [item({ id: "1", title: "Pack bags", deadline: "2026-07-20" })],
      }),
    ]);
    const schedule = buildNotificationSchedule(doc, { now: NOW });

    expect(schedule.version).toBe(NOTIFICATION_SCHEDULE_VERSION);
    expect(schedule.updatedAt).toBe(NOW);
    expect(schedule.notifications).toEqual([
      {
        id: "a:1:2026-07-20:0",
        listId: "a",
        itemId: "1",
        fireAt: "2026-07-20T09:00:00.000Z",
        title: "Pack bags",
        body: "Due today in Trip",
      },
    ]);
  });

  it("skips checked, archived, undated, and past items", () => {
    const doc = snapshot([
      list({
        id: "a",
        name: "List",
        items: [
          item({ id: "checked", deadline: "2026-07-20", checked: true }),
          item({ id: "archived", deadline: "2026-07-20", archived: true }),
          item({ id: "undated" }),
          // Its day-of reminder (09:00Z) already passed for a NOW of 12:00Z.
          item({ id: "past", deadline: "2026-07-15" }),
          item({ id: "future", deadline: "2026-07-16" }),
        ],
      }),
      list({ id: "archivedList", archived: true, items: [] }),
    ]);
    const schedule = buildNotificationSchedule(doc, { now: NOW });
    expect(schedule.notifications.map((n) => n.itemId)).toEqual(["future"]);
  });

  it("fires one reminder per lead offset that lands in the future", () => {
    const doc = snapshot([
      list({
        id: "a",
        name: "Bills",
        items: [item({ id: "1", title: "Rent", deadline: "2026-07-25" })],
      }),
    ]);
    const schedule = buildNotificationSchedule(doc, {
      now: NOW,
      leadDays: [0, 1, 7],
    });
    // A week before (07-18), the day before (07-24), and the day of (07-25).
    expect(
      schedule.notifications.map((n) => ({ fireAt: n.fireAt, body: n.body })),
    ).toEqual([
      { fireAt: "2026-07-18T09:00:00.000Z", body: "Due in 7 days in Bills" },
      { fireAt: "2026-07-24T09:00:00.000Z", body: "Due tomorrow in Bills" },
      { fireAt: "2026-07-25T09:00:00.000Z", body: "Due today in Bills" },
    ]);
  });

  it("drops lead reminders that would fire in the past", () => {
    const doc = snapshot([
      list({
        id: "a",
        name: "Soon",
        items: [item({ id: "1", deadline: "2026-07-16" })],
      }),
    ]);
    // With a week's lead the 07-16 due day's week-before (07-09) is long past,
    // but the day-of (07-16) is still ahead — only it survives.
    const schedule = buildNotificationSchedule(doc, {
      now: NOW,
      leadDays: [0, 7],
    });
    expect(schedule.notifications.map((n) => n.fireAt)).toEqual([
      "2026-07-16T09:00:00.000Z",
    ]);
  });

  it("arms several future occurrences of a recurring deadline", () => {
    const doc = snapshot([
      list({
        id: "a",
        name: "Chores",
        items: [
          item({
            id: "1",
            title: "Water plants",
            // Anchor already passed; recurrence rolls it forward.
            deadline: "2026-07-01",
            recurrence: { unit: "week", interval: 1 },
          }),
        ],
      }),
    ]);
    const schedule = buildNotificationSchedule(doc, {
      now: NOW,
      occurrencesAhead: 3,
    });
    // First future occurrence after 07-15 is 07-22, then 07-29, 08-05.
    expect(schedule.notifications.map((n) => n.fireAt)).toEqual([
      "2026-07-22T09:00:00.000Z",
      "2026-07-29T09:00:00.000Z",
      "2026-08-05T09:00:00.000Z",
    ]);
  });

  it("produces an empty schedule when disabled or when no lead offsets remain", () => {
    const doc = snapshot([
      list({
        id: "a",
        items: [item({ id: "1", deadline: "2026-07-20" })],
      }),
    ]);
    expect(
      buildNotificationSchedule(doc, { now: NOW, disabled: true })
        .notifications,
    ).toEqual([]);
    expect(
      buildNotificationSchedule(doc, { now: NOW, leadDays: [] }).notifications,
    ).toEqual([]);
  });

  it("sorts soonest-first across lists and caps the total", () => {
    // One dated item per day, all in the future, in ascending order.
    const day = (offset: number): string => {
      const dt = new Date(Date.UTC(2026, 7, 20 + offset));
      return dt.toISOString().slice(0, 10);
    };
    const many = Array.from({ length: MAX_NOTIFICATIONS + 5 }, (_, i) =>
      item({ id: `i${i}`, deadline: day(i) }),
    );
    const doc = snapshot([list({ id: "a", name: "Big", items: many })]);
    const schedule = buildNotificationSchedule(doc, { now: NOW });
    expect(schedule.notifications).toHaveLength(MAX_NOTIFICATIONS);
    const fires = schedule.notifications.map((n) => n.fireAt);
    expect([...fires]).toEqual([...fires].sort());
    // The soonest survives; the latest items were dropped by the cap.
    expect(schedule.notifications[0]?.fireAt).toBe("2026-08-20T09:00:00.000Z");
  });

  it("uses the injected formatter for localised text", () => {
    const doc = snapshot([
      list({
        id: "a",
        name: "Lista",
        items: [item({ id: "1", title: "Städa", deadline: "2026-07-20" })],
      }),
    ]);
    const schedule = buildNotificationSchedule(doc, {
      now: NOW,
      format: (ctx) => ({
        title: ctx.itemTitle,
        body: `${ctx.deadline}/${ctx.daysUntilDue}/${ctx.listName}`,
      }),
    });
    expect(schedule.notifications[0]?.body).toBe("2026-07-20/0/Lista");
  });
});

describe("futureDueDays", () => {
  it("returns the deadline of a future one-off, or nothing when past", () => {
    expect(futureDueDays({ deadline: "2026-07-20" }, NOW, 9, 3)).toEqual([
      "2026-07-20",
    ]);
    expect(futureDueDays({ deadline: "2026-07-10" }, NOW, 9, 3)).toEqual([]);
  });

  it("walks a recurring deadline forward to future occurrences", () => {
    expect(
      futureDueDays(
        { deadline: "2026-07-01", recurrence: { unit: "week", interval: 2 } },
        NOW,
        9,
        2,
      ),
    ).toEqual(["2026-07-29", "2026-08-12"]);
  });
});

describe("documentHasDeadline", () => {
  it("is true when any active unchecked item is dated", () => {
    expect(
      documentHasDeadline(
        snapshot([
          list({ id: "a", items: [item({ id: "1", deadline: "2026-01-01" })] }),
        ]),
      ),
    ).toBe(true);
  });

  it("ignores checked, archived, and undated items", () => {
    expect(
      documentHasDeadline(
        snapshot([
          list({
            id: "a",
            items: [
              item({ id: "1", deadline: "2026-01-01", checked: true }),
              item({ id: "2" }),
            ],
          }),
          list({
            id: "b",
            archived: true,
            items: [item({ id: "3", deadline: "2026-01-01" })],
          }),
        ]),
      ),
    ).toBe(false);
  });
});
