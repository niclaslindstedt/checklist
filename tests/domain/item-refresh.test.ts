// Coverage for refreshing items — a repeat with no due date, which brings an
// item back unchecked at the top of its list once its cadence comes round.
// Refreshes resolve in local time, so every instant here is built with the
// local-time `Date` constructor and the expectations are derived the same way:
// the suite passes in any time zone rather than pinning one.
import { describe, expect, it } from "vitest";

import {
  applyRefreshes,
  dueRefreshes,
  findItem,
  isRefreshing,
  nextRefreshAt,
  refreshItems,
  setAllChecked,
  setItemTiming,
  toggleItem,
} from "../../src/domain/checklists.ts";
import type {
  Checklist,
  ChecklistItem,
  Snapshot,
  TimingPatch,
} from "../../src/domain/types.ts";

/** A local-time instant as ISO-8601. */
function at(y: number, m: number, d: number, h = 0, min = 0): string {
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

function listOf(items: ChecklistItem[]): Checklist {
  return {
    version: 1,
    id: "c1",
    name: "Shopping",
    templateId: "",
    items,
    createdAt: at(2026, 6, 1),
    updatedAt: at(2026, 6, 1),
  };
}

function item(over: Partial<ChecklistItem> & { id: string }): ChecklistItem {
  return { title: over.id, checked: false, ...over };
}

function timing(over: Partial<TimingPatch>): TimingPatch {
  return { notBefore: null, deadline: null, recurrence: null, ...over };
}

function snapshotOf(checklists: Checklist[]): Snapshot {
  return { templates: [], checklists };
}

describe("isRefreshing", () => {
  it("is true for a repeat with no due date and false otherwise", () => {
    const weekly = { unit: "week" as const, interval: 1 };
    expect(isRefreshing({ recurrence: weekly })).toBe(true);
    expect(isRefreshing({ recurrence: weekly, deadline: "2026-07-01" })).toBe(
      false,
    );
    expect(isRefreshing({ deadline: "2026-07-01" })).toBe(false);
    expect(isRefreshing({})).toBe(false);
  });
});

describe("nextRefreshAt", () => {
  it("counts one interval on from the check, keeping its time of day", () => {
    expect(
      nextRefreshAt({ unit: "week", interval: 1 }, at(2026, 6, 4, 14, 30)),
    ).toBe(at(2026, 6, 11, 14, 30));
  });

  it("honours a daily repeat's chosen time instead", () => {
    expect(
      nextRefreshAt(
        { unit: "day", interval: 1, at: "07:00" },
        at(2026, 6, 4, 14, 30),
      ),
    ).toBe(at(2026, 6, 5, 7, 0));
  });

  it("multiplies the interval", () => {
    expect(
      nextRefreshAt({ unit: "day", interval: 3 }, at(2026, 6, 4, 9, 0)),
    ).toBe(at(2026, 6, 7, 9, 0));
    expect(
      nextRefreshAt({ unit: "year", interval: 2 }, at(2026, 6, 4, 9, 0)),
    ).toBe(at(2028, 6, 4, 9, 0));
  });

  it("clamps the day of month on a monthly step", () => {
    expect(
      nextRefreshAt({ unit: "month", interval: 1 }, at(2026, 1, 31, 9, 0)),
    ).toBe(at(2026, 2, 28, 9, 0));
  });

  it("floors a degenerate interval at one so the wait can't collapse", () => {
    expect(nextRefreshAt({ unit: "day", interval: 0 }, at(2026, 6, 4, 9))).toBe(
      at(2026, 6, 5, 9),
    );
  });

  it("ignores a malformed time and falls back to the check's own", () => {
    expect(
      nextRefreshAt(
        { unit: "day", interval: 1, at: "99:99" },
        at(2026, 6, 4, 9),
      ),
    ).toBe(at(2026, 6, 5, 9));
  });
});

describe("toggleItem on a refreshing item", () => {
  it("checks it off and stamps when it is due back", () => {
    const list = listOf([
      item({ id: "milk", recurrence: { unit: "week", interval: 1 } }),
    ]);
    const next = toggleItem(list, "milk", at(2026, 6, 4, 14, 30));
    const milk = findItem(next.items, "milk");
    expect(milk?.checked).toBe(true);
    expect(milk?.refreshAt).toBe(at(2026, 6, 11, 14, 30));
  });

  it("clears the stamp when the box is unticked by hand", () => {
    const list = listOf([
      item({
        id: "milk",
        checked: true,
        checkedAt: at(2026, 6, 4),
        refreshAt: at(2026, 6, 11),
        recurrence: { unit: "week", interval: 1 },
      }),
    ]);
    const next = toggleItem(list, "milk", at(2026, 6, 5));
    const milk = findItem(next.items, "milk");
    expect(milk?.checked).toBe(false);
    expect(milk?.refreshAt).toBeUndefined();
  });

  it("leaves a dated repeat rolling its deadline, with no stamp", () => {
    const list = listOf([
      item({
        id: "rent",
        deadline: "2026-06-01",
        recurrence: { unit: "month", interval: 1 },
      }),
    ]);
    const next = toggleItem(list, "rent", at(2026, 6, 4));
    const rent = findItem(next.items, "rent");
    expect(rent?.checked).toBe(false);
    expect(rent?.deadline).toBe("2026-07-01");
    expect(rent?.refreshAt).toBeUndefined();
  });

  it("stamps a refreshing sub-item caught by a parent's cascade", () => {
    const list = listOf([
      item({
        id: "dairy",
        children: [
          item({ id: "milk", recurrence: { unit: "week", interval: 1 } }),
        ],
      }),
    ]);
    const next = toggleItem(list, "dairy", at(2026, 6, 4, 9, 0));
    expect(findItem(next.items, "milk")?.refreshAt).toBe(at(2026, 6, 11, 9, 0));
  });
});

describe("setAllChecked", () => {
  it("stamps the refreshing items it sweeps, and clears them on the way back", () => {
    const list = listOf([
      item({ id: "milk", recurrence: { unit: "week", interval: 1 } }),
      item({ id: "bread" }),
    ]);
    const checked = setAllChecked(list, true, at(2026, 6, 4, 9, 0));
    expect(findItem(checked.items, "milk")?.refreshAt).toBe(
      at(2026, 6, 11, 9, 0),
    );
    expect(findItem(checked.items, "bread")?.refreshAt).toBeUndefined();
    const cleared = setAllChecked(checked, false, at(2026, 6, 5));
    expect(findItem(cleared.items, "milk")?.refreshAt).toBeUndefined();
  });
});

describe("setItemTiming", () => {
  const resting = () =>
    listOf([
      item({
        id: "milk",
        checked: true,
        checkedAt: at(2026, 6, 4),
        refreshAt: at(2026, 6, 11),
        recurrence: { unit: "week", interval: 1 },
      }),
    ]);

  it("keeps a pending wait when the cadence is re-saved unchanged", () => {
    const list = resting();
    const next = setItemTiming(
      list,
      "milk",
      timing({ recurrence: { unit: "week", interval: 1 } }),
      at(2026, 6, 5),
    );
    // Nothing changed at all, so the list comes back by reference — and the
    // item is still resting until its own moment.
    expect(next).toBe(list);
    expect(findItem(next.items, "milk")?.refreshAt).toBe(at(2026, 6, 11));
  });

  it("drops a pending wait when the cadence changes", () => {
    const next = setItemTiming(
      resting(),
      "milk",
      timing({ recurrence: { unit: "month", interval: 1 } }),
      at(2026, 6, 5),
    );
    expect(findItem(next.items, "milk")?.refreshAt).toBeUndefined();
  });

  it("drops a pending wait when the repeat is removed", () => {
    const next = setItemTiming(resting(), "milk", timing({}), at(2026, 6, 5));
    expect(findItem(next.items, "milk")?.recurrence).toBeUndefined();
    expect(findItem(next.items, "milk")?.refreshAt).toBeUndefined();
  });

  it("drops a pending wait when a due date is pinned to the repeat", () => {
    const next = setItemTiming(
      resting(),
      "milk",
      timing({
        deadline: "2026-07-01",
        recurrence: { unit: "week", interval: 1 },
      }),
      at(2026, 6, 5),
    );
    expect(findItem(next.items, "milk")?.refreshAt).toBeUndefined();
  });
});

describe("dueRefreshes", () => {
  it("finds the checked items whose wait has run out", () => {
    const doc = snapshotOf([
      listOf([
        item({ id: "milk", checked: true, refreshAt: at(2026, 6, 11, 8) }),
        item({ id: "eggs", checked: true, refreshAt: at(2026, 6, 20, 8) }),
        item({ id: "bread", checked: true }),
      ]),
    ]);
    const due = dueRefreshes(doc, at(2026, 6, 12, 9));
    expect(due).toHaveLength(1);
    expect(due[0]!.items.map((it) => it.id)).toEqual(["milk"]);
  });

  it("reaches into sub-items but skips archived ones and archived lists", () => {
    const nested = listOf([
      item({
        id: "dairy",
        children: [
          item({ id: "milk", checked: true, refreshAt: at(2026, 6, 1) }),
          item({
            id: "cheese",
            checked: true,
            archived: true,
            refreshAt: at(2026, 6, 1),
          }),
        ],
      }),
    ]);
    const putAway: Checklist = {
      ...listOf([item({ id: "x", checked: true, refreshAt: at(2026, 6, 1) })]),
      id: "c2",
      archived: true,
    };
    const due = dueRefreshes(snapshotOf([nested, putAway]), at(2026, 6, 12));
    expect(due).toHaveLength(1);
    expect(due[0]!.items.map((it) => it.id)).toEqual(["milk"]);
  });

  it("returns nothing when every wait is still ahead", () => {
    const doc = snapshotOf([
      listOf([item({ id: "milk", checked: true, refreshAt: at(2026, 6, 20) })]),
    ]);
    expect(dueRefreshes(doc, at(2026, 6, 12))).toEqual([]);
  });
});

describe("refreshItems", () => {
  it("unchecks, clears the stamps, and hoists to the top of the list", () => {
    const list = listOf([
      item({ id: "bread" }),
      item({ id: "eggs" }),
      item({
        id: "milk",
        checked: true,
        checkedAt: at(2026, 6, 4),
        refreshAt: at(2026, 6, 11),
        recurrence: { unit: "week", interval: 1 },
      }),
    ]);
    const next = refreshItems(list, ["milk"], at(2026, 6, 12));
    expect(next.items.map((it) => it.id)).toEqual(["milk", "bread", "eggs"]);
    const milk = findItem(next.items, "milk");
    expect(milk?.checked).toBe(false);
    expect(milk?.checkedAt).toBeUndefined();
    expect(milk?.refreshAt).toBeUndefined();
    // The cadence survives — the item is due again, not done with.
    expect(milk?.recurrence).toEqual({ unit: "week", interval: 1 });
  });

  it("hoists a nested item to the top of its own category, not the list", () => {
    const list = listOf([
      item({ id: "bakery" }),
      item({
        id: "dairy",
        children: [
          item({ id: "butter" }),
          item({ id: "milk", checked: true, refreshAt: at(2026, 6, 11) }),
        ],
      }),
    ]);
    const next = refreshItems(list, ["milk"], at(2026, 6, 12));
    expect(next.items.map((it) => it.id)).toEqual(["bakery", "dairy"]);
    expect(findItem(next.items, "dairy")?.children?.map((it) => it.id)).toEqual(
      ["milk", "butter"],
    );
  });

  it("keeps the relative order of several items coming back together", () => {
    const list = listOf([
      item({ id: "bread" }),
      item({ id: "milk", checked: true, refreshAt: at(2026, 6, 11) }),
      item({ id: "eggs", checked: true, refreshAt: at(2026, 6, 11) }),
    ]);
    const next = refreshItems(list, ["milk", "eggs"], at(2026, 6, 12));
    expect(next.items.map((it) => it.id)).toEqual(["milk", "eggs", "bread"]);
  });

  it("is a no-op (same reference) for an empty set or an unknown id", () => {
    const list = listOf([item({ id: "bread" })]);
    expect(refreshItems(list, [], at(2026, 6, 12))).toBe(list);
    expect(refreshItems(list, ["ghost"], at(2026, 6, 12))).toBe(list);
  });
});

describe("applyRefreshes", () => {
  it("touches only the named lists", () => {
    const shopping = listOf([
      item({ id: "bread" }),
      item({ id: "milk", checked: true, refreshAt: at(2026, 6, 11) }),
    ]);
    const other: Checklist = { ...listOf([item({ id: "z" })]), id: "c2" };
    const doc = snapshotOf([shopping, other]);
    const now = at(2026, 6, 12);
    const next = applyRefreshes(doc, dueRefreshes(doc, now), now);
    expect(next.checklists[0]!.items.map((it) => it.id)).toEqual([
      "milk",
      "bread",
    ]);
    expect(next.checklists[1]).toBe(other);
  });

  it("is a no-op (same reference) with nothing pending", () => {
    const doc = snapshotOf([listOf([item({ id: "bread" })])]);
    expect(applyRefreshes(doc, [], at(2026, 6, 12))).toBe(doc);
  });
});
