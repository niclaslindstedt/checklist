import { describe, expect, it } from "vitest";

import type {
  Checklist,
  ChecklistItem,
  Snapshot,
} from "../../src/domain/types.ts";
import {
  applyWidgetAction,
  buildWidgetSnapshot,
  DEFAULT_WIDGET_ITEM_LIMIT,
  parseWidgetAction,
  resolvedDeadline,
  WIDGET_SNAPSHOT_VERSION,
} from "../../src/domain/widget-snapshot.ts";

// Fixed "now" so the due buckets are deterministic — noon on 2026-07-15.
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

describe("buildWidgetSnapshot", () => {
  it("projects the active list's progress and next open items", () => {
    const doc = snapshot([
      list({
        id: "a",
        name: "Groceries",
        glyph: "cart",
        color: "#f00",
        items: [
          item({ id: "1", title: "Milk", checked: true }),
          item({ id: "2", title: "Bread" }),
          item({ id: "3", title: "Eggs" }),
        ],
      }),
    ]);

    const snap = buildWidgetSnapshot(doc, { now: NOW, activeListId: "a" });

    expect(snap.version).toBe(WIDGET_SNAPSHOT_VERSION);
    expect(snap.updatedAt).toBe(NOW);
    expect(snap.active).toEqual({
      id: "a",
      name: "Groceries",
      glyph: "cart",
      color: "#f00",
      total: 3,
      checked: 1,
      open: [
        { id: "2", title: "Bread" },
        { id: "3", title: "Eggs" },
      ],
    });
  });

  it("falls back to the first active list when the id is unknown", () => {
    const doc = snapshot([
      list({ id: "a", name: "First" }),
      list({ id: "b", name: "Second" }),
    ]);
    expect(
      buildWidgetSnapshot(doc, { now: NOW, activeListId: "gone" }).active?.id,
    ).toBe("a");
  });

  it("skips archived lists everywhere", () => {
    const doc = snapshot([
      list({ id: "a", name: "Active" }),
      list({ id: "z", name: "Gone", archived: true }),
    ]);
    const snap = buildWidgetSnapshot(doc, { now: NOW, activeListId: "z" });
    expect(snap.lists.map((l) => l.id)).toEqual(["a"]);
    expect(snap.active?.id).toBe("a");
  });

  it("counts sub-items in progress totals", () => {
    const doc = snapshot([
      list({
        id: "a",
        items: [
          item({
            id: "p",
            checked: true,
            children: [
              item({ id: "c1", checked: true }),
              item({ id: "c2", checked: false }),
            ],
          }),
        ],
      }),
    ]);
    const snap = buildWidgetSnapshot(doc, { now: NOW, activeListId: "a" });
    expect(snap.active).toMatchObject({ total: 3, checked: 2 });
  });

  it("limits the open items to itemLimit", () => {
    const items = Array.from({ length: 20 }, (_, i) => item({ id: `i${i}` }));
    const doc = snapshot([list({ id: "a", items })]);
    expect(buildWidgetSnapshot(doc, { now: NOW }).active?.open).toHaveLength(
      DEFAULT_WIDGET_ITEM_LIMIT,
    );
    expect(
      buildWidgetSnapshot(doc, { now: NOW, itemLimit: 3 }).active?.open,
    ).toHaveLength(3);
  });

  it("returns a null active projection for an empty document", () => {
    expect(buildWidgetSnapshot(snapshot([]), { now: NOW }).active).toBeNull();
  });

  it("collects due-today and overdue items across lists, soonest first", () => {
    const doc = snapshot([
      list({
        id: "a",
        name: "Home",
        items: [
          item({ id: "over", title: "Overdue", deadline: "2026-07-10" }),
          item({ id: "today", title: "Today", deadline: "2026-07-15" }),
          item({ id: "later", title: "Later", deadline: "2026-07-20" }),
          item({
            id: "done",
            title: "Done",
            checked: true,
            deadline: "2026-07-01",
          }),
        ],
      }),
      list({
        id: "b",
        name: "Work",
        items: [item({ id: "wover", title: "Report", deadline: "2026-07-12" })],
      }),
    ]);

    const due = buildWidgetSnapshot(doc, { now: NOW }).due;

    expect(due.map((d) => d.id)).toEqual(["over", "wover", "today"]);
    expect(due[0]).toMatchObject({
      listId: "a",
      listName: "Home",
      status: "overdue",
    });
    expect(due.find((d) => d.id === "today")?.status).toBe("due-soon");
    // Tomorrow (due-soon but not today) and later dates are excluded.
    expect(due.some((d) => d.id === "later")).toBe(false);
    // A checked dated item is done, not due.
    expect(due.some((d) => d.id === "done")).toBe(false);
  });

  it("resolves a missed recurring deadline to its next occurrence", () => {
    const doc = snapshot([
      list({
        id: "a",
        items: [
          item({
            id: "r",
            title: "Water plants",
            deadline: "2026-07-01",
            recurrence: { unit: "week", interval: 1 },
          }),
        ],
      }),
    ]);
    // 2026-07-01 + weeks → first occurrence strictly after 2026-07-15 is 07-22.
    const snap = buildWidgetSnapshot(doc, { now: NOW, activeListId: "a" });
    expect(snap.active?.open[0]?.deadline).toBe("2026-07-22");
    // 07-22 is neither overdue nor today, so it isn't in the due list.
    expect(snap.due).toHaveLength(0);
  });
});

describe("resolvedDeadline", () => {
  it("returns undefined for an undated item", () => {
    expect(resolvedDeadline({}, NOW)).toBeUndefined();
  });

  it("returns a one-off deadline unchanged", () => {
    expect(resolvedDeadline({ deadline: "2026-01-01" }, NOW)).toBe(
      "2026-01-01",
    );
  });

  it("keeps a not-yet-overdue recurring anchor", () => {
    expect(
      resolvedDeadline(
        { deadline: "2026-07-20", recurrence: { unit: "week", interval: 1 } },
        NOW,
      ),
    ).toBe("2026-07-20");
  });
});

describe("parseWidgetAction", () => {
  it("accepts a well-formed toggle", () => {
    expect(
      parseWidgetAction({ type: "toggle", listId: "a", itemId: "1" }),
    ).toEqual({
      type: "toggle",
      listId: "a",
      itemId: "1",
    });
  });

  it("rejects malformed values", () => {
    expect(parseWidgetAction(null)).toBeNull();
    expect(parseWidgetAction("toggle")).toBeNull();
    expect(
      parseWidgetAction({ type: "delete", listId: "a", itemId: "1" }),
    ).toBeNull();
    expect(parseWidgetAction({ type: "toggle", listId: "a" })).toBeNull();
  });
});

describe("applyWidgetAction", () => {
  const base = snapshot([
    list({ id: "a", items: [item({ id: "1", checked: false })] }),
    list({ id: "b", items: [item({ id: "2", checked: false })] }),
  ]);

  it("toggles the item in the named list, not the active one", () => {
    const next = applyWidgetAction(
      base,
      { type: "toggle", listId: "b", itemId: "2" },
      NOW,
    );
    expect(next.checklists[1]!.items[0]!.checked).toBe(true);
    expect(next.checklists[0]!.items[0]!.checked).toBe(false);
  });

  it("is a no-op for an unknown list or item", () => {
    expect(
      applyWidgetAction(
        base,
        { type: "toggle", listId: "x", itemId: "1" },
        NOW,
      ),
    ).toBe(base);
    expect(
      applyWidgetAction(
        base,
        { type: "toggle", listId: "a", itemId: "9" },
        NOW,
      ),
    ).toBe(base);
  });
});
