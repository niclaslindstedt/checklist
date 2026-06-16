import { describe, expect, it } from "vitest";
import {
  activeItems,
  addItem,
  archivedItems,
  createChecklist,
  deleteItem,
  instantiate,
  isComplete,
  moveItem,
  nextChecklistName,
  progress,
  renameChecklist,
  setArchived,
  toggleItem,
} from "../../src/domain/checklists.ts";
import { createTemplate } from "../../src/domain/templates.ts";
import type { Template } from "../../src/domain/types.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function sampleTemplate(): Template {
  return {
    ...createTemplate({ id: "t1", name: "Trip", now: NOW }),
    items: [
      { id: "i1", title: "Passport", required: true },
      { id: "i2", title: "Sunglasses" },
    ],
  };
}

describe("checklists", () => {
  it("instantiates an unchecked copy that points at its template", () => {
    const c = instantiate(sampleTemplate(), "c1", NOW);
    expect(c.templateId).toBe("t1");
    expect(c.items.every((i) => i.checked === false)).toBe(true);
  });

  it("toggles a single item without mutating the source", () => {
    const c = instantiate(sampleTemplate(), "c1", NOW);
    const toggled = toggleItem(c, "i1", NOW);
    expect(c.items[0]?.checked).toBe(false);
    expect(toggled.items[0]?.checked).toBe(true);
    expect(progress(toggled)).toEqual({ checked: 1, total: 2 });
  });

  it("is complete only when all required items are checked", () => {
    const c = instantiate(sampleTemplate(), "c1", NOW);
    expect(isComplete(c)).toBe(false);
    expect(isComplete(toggleItem(c, "i1", NOW))).toBe(true);
  });
});

describe("free-standing checklist item operations", () => {
  const base = createChecklist("c1", "List", NOW);

  it("starts an empty list not tied to any template", () => {
    expect(base.templateId).toBe("");
    expect(base.items).toHaveLength(0);
  });

  it("appends a trimmed, unchecked item immutably", () => {
    const next = addItem(base, { id: "i1", title: "  Milk  " }, NOW);
    expect(next.items).toEqual([{ id: "i1", title: "Milk", checked: false }]);
    expect(base.items).toHaveLength(0);
  });

  it("appends to the bottom by default and when asked", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW, "bottom");
    expect(c.items.map((i) => i.id)).toEqual(["i1", "i2"]);
  });

  it("prepends to the top when position is 'top'", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW, "top");
    expect(c.items.map((i) => i.id)).toEqual(["i2", "i1"]);
  });

  it("archives an item without removing it, hiding it from the view", () => {
    const withItem = addItem(base, { id: "i1", title: "A" }, NOW);
    const archived = setArchived(withItem, "i1", true, NOW);
    expect(archived.items[0]?.archived).toBe(true);
    expect(activeItems(archived)).toHaveLength(0);
  });

  it("partitions items into active and archived views", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW);
    c = setArchived(c, "i2", true, NOW);
    expect(activeItems(c).map((it) => it.id)).toEqual(["i1"]);
    expect(archivedItems(c).map((it) => it.id)).toEqual(["i2"]);
  });

  it("restores an archived item back into the active view", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = setArchived(c, "i1", true, NOW);
    const restored = setArchived(c, "i1", false, NOW);
    expect(archivedItems(restored)).toHaveLength(0);
    expect(activeItems(restored).map((it) => it.id)).toEqual(["i1"]);
  });

  it("deletes an item entirely", () => {
    const withItem = addItem(base, { id: "i1", title: "A" }, NOW);
    expect(deleteItem(withItem, "i1", NOW).items).toHaveLength(0);
  });

  it("counts progress over active items only, ignoring archived ones", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW);
    c = toggleItem(c, "i1", NOW);
    c = setArchived(c, "i2", true, NOW);
    expect(progress(c)).toEqual({ checked: 1, total: 1 });
  });
});

describe("renameChecklist", () => {
  const LATER = "2026-02-02T00:00:00.000Z";

  it("trims the new name and bumps updatedAt without mutating the source", () => {
    const c = createChecklist("c1", "Old", NOW);
    const renamed = renameChecklist(c, "  Groceries  ", LATER);
    expect(renamed.name).toBe("Groceries");
    expect(renamed.updatedAt).toBe(LATER);
    expect(c.name).toBe("Old");
  });
});

describe("nextChecklistName", () => {
  it("uses the bare base name when nothing carries it yet", () => {
    expect(nextChecklistName([], "Checklist")).toBe("Checklist");
    expect(nextChecklistName([{ name: "Groceries" }], "Checklist")).toBe(
      "Checklist",
    );
  });

  it("suffixes with the lowest unused number once the base is taken", () => {
    expect(nextChecklistName([{ name: "Checklist" }], "Checklist")).toBe(
      "Checklist 2",
    );
    expect(
      nextChecklistName(
        [{ name: "Checklist" }, { name: "Checklist 2" }],
        "Checklist",
      ),
    ).toBe("Checklist 3");
  });

  it("fills the lowest gap rather than the count + 1", () => {
    expect(
      nextChecklistName(
        [{ name: "Checklist" }, { name: "Checklist 3" }],
        "Checklist",
      ),
    ).toBe("Checklist 2");
  });
});

describe("moveItem", () => {
  const LATER = "2026-02-02T00:00:00.000Z";

  function listOf(...titles: string[]) {
    let c = createChecklist("c1", "List", NOW);
    titles.forEach((t, i) => {
      c = addItem(c, { id: `i${i + 1}`, title: t }, NOW);
    });
    return c;
  }

  const ids = (c: ReturnType<typeof listOf>) => c.items.map((it) => it.id);

  it("moves an item down to a new index without mutating the source", () => {
    const c = listOf("A", "B", "C");
    const moved = moveItem(c, "i1", 2, LATER);
    expect(ids(moved)).toEqual(["i2", "i3", "i1"]);
    expect(ids(c)).toEqual(["i1", "i2", "i3"]);
    expect(moved.updatedAt).toBe(LATER);
  });

  it("moves an item up to an earlier index", () => {
    const c = listOf("A", "B", "C");
    expect(ids(moveItem(c, "i3", 0, LATER))).toEqual(["i3", "i1", "i2"]);
  });

  it("clamps an out-of-range target index to the ends", () => {
    const c = listOf("A", "B", "C");
    expect(ids(moveItem(c, "i1", 99, LATER))).toEqual(["i2", "i3", "i1"]);
    expect(ids(moveItem(c, "i3", -5, LATER))).toEqual(["i3", "i1", "i2"]);
  });

  it("treats a no-op move as untouched, leaving updatedAt alone", () => {
    const c = listOf("A", "B", "C");
    const same = moveItem(c, "i2", 1, LATER);
    expect(same).toBe(c);
    expect(same.updatedAt).toBe(NOW);
  });

  it("returns the checklist unchanged for an unknown item", () => {
    const c = listOf("A", "B");
    expect(moveItem(c, "nope", 0, LATER)).toBe(c);
  });

  it("reorders by the active view while pinning archived items in place", () => {
    // Full order: A(i1), B(i2, archived), C(i3). Active view is [A, C];
    // moving C above A must keep the archived B anchored to its slot.
    let c = listOf("A", "B", "C");
    c = setArchived(c, "i2", true, NOW);
    const moved = moveItem(c, "i3", 0, LATER);
    expect(ids(moved)).toEqual(["i3", "i2", "i1"]);
    expect(activeItems(moved).map((it) => it.id)).toEqual(["i3", "i1"]);
    expect(moved.items[1]?.archived).toBe(true);
  });
});
