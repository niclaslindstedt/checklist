import { describe, expect, it } from "vitest";
import {
  activeItems,
  addItem,
  addItems,
  archiveChecked,
  archivedByChecklist,
  archivedItems,
  createChecklist,
  deleteChecked,
  deleteItem,
  displayItems,
  editItem,
  instantiate,
  isComplete,
  moveDisplayedItem,
  moveItem,
  nextChecklistName,
  progress,
  renameChecklist,
  setArchived,
  sortCheckedToBottom,
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

  it("groups archived items by source checklist, dropping empty lists", () => {
    let a = addItem(
      createChecklist("c1", "Groceries", NOW),
      {
        id: "i1",
        title: "Milk",
      },
      NOW,
    );
    a = setArchived(a, "i1", true, NOW);
    const b = createChecklist("c2", "Chores", NOW); // nothing archived
    let c = addItem(
      createChecklist("c3", "Trip", NOW),
      {
        id: "i2",
        title: "Passport",
      },
      NOW,
    );
    c = setArchived(c, "i2", true, NOW);

    const groups = archivedByChecklist({
      templates: [],
      checklists: [a, b, c],
    });
    expect(groups.map((g) => g.name)).toEqual(["Groceries", "Trip"]);
    expect(groups.map((g) => g.items.map((it) => it.id))).toEqual([
      ["i1"],
      ["i2"],
    ]);
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

  describe("editItem", () => {
    const LATER = "2026-02-02T00:00:00.000Z";
    const seeded = addItem(base, { id: "i1", title: "A" }, NOW);

    it("edits the title, trimming it and bumping updatedAt", () => {
      const next = editItem(seeded, "i1", { title: "  Buy milk  " }, LATER);
      expect(next.items[0]!.title).toBe("Buy milk");
      expect(next.updatedAt).toBe(LATER);
    });

    it("sets a trimmed notes body without touching the title", () => {
      const next = editItem(seeded, "i1", { notes: "  see receipt\n" }, LATER);
      expect(next.items[0]!.title).toBe("A");
      expect(next.items[0]!.notes).toBe("see receipt");
    });

    it("drops the notes key when the body is cleared to empty", () => {
      const noted = editItem(seeded, "i1", { notes: "keep" }, NOW);
      const cleared = editItem(noted, "i1", { notes: "   " }, LATER);
      expect("notes" in cleared.items[0]!).toBe(false);
    });

    it("leaves an untouched field alone (title-only edit keeps the note)", () => {
      const noted = editItem(seeded, "i1", { notes: "remember" }, NOW);
      const next = editItem(noted, "i1", { title: "B" }, LATER);
      expect(next.items[0]!.notes).toBe("remember");
    });

    it("ignores a blank title rather than emptying the headline", () => {
      const next = editItem(seeded, "i1", { title: "   " }, LATER);
      expect(next.items[0]!.title).toBe("A");
    });

    it("is a no-op (same reference, no updatedAt bump) when nothing changes", () => {
      const next = editItem(seeded, "i1", { title: "A" }, LATER);
      expect(next).toBe(seeded);
    });

    it("returns the same checklist when the id is unknown", () => {
      expect(editItem(seeded, "nope", { title: "X" }, LATER)).toBe(seeded);
    });
  });

  it("archives every finished item in one sweep, leaving the rest active", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW);
    c = addItem(c, { id: "i3", title: "C" }, NOW);
    c = toggleItem(c, "i1", NOW); // finished
    c = toggleItem(c, "i3", NOW); // finished
    const swept = archiveChecked(c, NOW);
    expect(archivedItems(swept).map((it) => it.id)).toEqual(["i1", "i3"]);
    expect(activeItems(swept).map((it) => it.id)).toEqual(["i2"]);
  });

  it("is a no-op (same reference) when nothing finished is active", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW);
    c = toggleItem(c, "i1", NOW);
    c = setArchived(c, "i1", true, NOW); // checked but already archived
    expect(archiveChecked(c, NOW)).toBe(c);
    expect(deleteChecked(c, NOW)).toBe(c);
  });

  it("deletes every finished item in one sweep, keeping archived ones", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW);
    c = addItem(c, { id: "i3", title: "C" }, NOW);
    c = toggleItem(c, "i1", NOW); // finished
    c = setArchived(c, "i2", true, NOW); // archived, untouched
    const swept = deleteChecked(c, NOW);
    expect(swept.items.map((it) => it.id)).toEqual(["i2", "i3"]);
  });

  it("counts progress over active items only, ignoring archived ones", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW);
    c = toggleItem(c, "i1", NOW);
    c = setArchived(c, "i2", true, NOW);
    expect(progress(c)).toEqual({ checked: 1, total: 1 });
  });
});

describe("addItems", () => {
  const base = createChecklist("c1", "List", NOW);

  it("appends many items, preserving checked / required / notes", () => {
    const seeded = addItem(base, { id: "i0", title: "Existing" }, "2025");
    const next = addItems(
      seeded,
      [
        { id: "i1", title: "Milk", checked: false },
        { id: "i2", title: "Bread", checked: true, notes: "Whole grain" },
        { id: "i3", title: "Passport", checked: true, required: true },
      ],
      NOW,
    );
    // Existing item is kept; imports land after it in order.
    expect(next.items.map((i) => i.title)).toEqual([
      "Existing",
      "Milk",
      "Bread",
      "Passport",
    ]);
    expect(next.items[2]).toEqual({
      id: "i2",
      title: "Bread",
      checked: true,
      notes: "Whole grain",
    });
    expect(next.items[3]?.required).toBe(true);
    expect(next.updatedAt).toBe(NOW);
  });

  it("is a no-op (same reference) when given no items", () => {
    expect(addItems(base, [], NOW)).toBe(base);
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

describe("toggleItem checkedAt", () => {
  const CHECKED_AT = "2026-03-03T00:00:00.000Z";

  function singleItemList() {
    let c = createChecklist("c1", "List", NOW);
    c = addItem(c, { id: "i1", title: "A" }, NOW);
    return c;
  }

  it("stamps checkedAt when an item is checked", () => {
    const checked = toggleItem(singleItemList(), "i1", CHECKED_AT);
    expect(checked.items[0]?.checked).toBe(true);
    expect(checked.items[0]?.checkedAt).toBe(CHECKED_AT);
  });

  it("clears checkedAt when an item is unchecked", () => {
    let c = toggleItem(singleItemList(), "i1", CHECKED_AT);
    c = toggleItem(c, "i1", "2026-03-04T00:00:00.000Z");
    expect(c.items[0]?.checked).toBe(false);
    expect(c.items[0]?.checkedAt).toBeUndefined();
  });
});

describe("sortCheckedToBottom", () => {
  function listOf(...titles: string[]) {
    let c = createChecklist("c1", "List", NOW);
    titles.forEach((t, i) => {
      c = addItem(c, { id: `i${i + 1}`, title: t }, NOW);
    });
    return c;
  }

  const ids = (items: { id: string }[]) => items.map((it) => it.id);

  it("keeps unchecked items first and sinks checked ones below, newest first", () => {
    let c = listOf("A", "B", "C", "D");
    c = toggleItem(c, "i1", "2026-01-01T00:00:01.000Z"); // A, oldest check
    c = toggleItem(c, "i3", "2026-01-01T00:00:02.000Z"); // C, newest check
    const sorted = sortCheckedToBottom(c.items);
    // Unchecked B, D keep document order; checked C (newest) then A (oldest).
    expect(ids(sorted)).toEqual(["i2", "i4", "i3", "i1"]);
  });

  it("sinks checked items without a timestamp last among the checked group", () => {
    let c = listOf("A", "B", "C");
    // i1 checked the legacy way (no checkedAt), i3 with a stamp.
    c = {
      ...c,
      items: c.items.map((it) =>
        it.id === "i1" ? { ...it, checked: true } : it,
      ),
    };
    c = toggleItem(c, "i3", "2026-01-01T00:00:05.000Z");
    const sorted = sortCheckedToBottom(c.items);
    expect(ids(sorted)).toEqual(["i2", "i3", "i1"]);
  });

  it("does not mutate the input array", () => {
    let c = listOf("A", "B");
    c = toggleItem(c, "i1", "2026-01-01T00:00:01.000Z");
    const before = ids(c.items);
    sortCheckedToBottom(c.items);
    expect(ids(c.items)).toEqual(before);
  });
});

describe("displayItems", () => {
  function listOf(...titles: string[]) {
    let c = createChecklist("c1", "List", NOW);
    titles.forEach((t, i) => {
      c = addItem(c, { id: `i${i + 1}`, title: t }, NOW);
    });
    return c;
  }

  const ids = (items: { id: string }[]) => items.map((it) => it.id);

  it("returns plain active order when the sort is off", () => {
    let c = listOf("A", "B", "C");
    c = toggleItem(c, "i1", "2026-01-01T00:00:01.000Z");
    expect(ids(displayItems(c, false))).toEqual(["i1", "i2", "i3"]);
  });

  it("sinks checked items when the sort is on, excluding archived", () => {
    let c = listOf("A", "B", "C");
    c = toggleItem(c, "i1", "2026-01-01T00:00:01.000Z");
    c = setArchived(c, "i2", true, NOW);
    expect(ids(displayItems(c, true))).toEqual(["i3", "i1"]);
  });
});

describe("moveDisplayedItem", () => {
  const LATER = "2026-02-02T00:00:00.000Z";

  function listOf(...titles: string[]) {
    let c = createChecklist("c1", "List", NOW);
    titles.forEach((t, i) => {
      c = addItem(c, { id: `i${i + 1}`, title: t }, NOW);
    });
    return c;
  }

  const docIds = (c: ReturnType<typeof listOf>) => c.items.map((it) => it.id);
  const viewIds = (c: ReturnType<typeof listOf>) =>
    displayItems(c, true).map((it) => it.id);

  it("delegates straight to moveItem when the sort is off", () => {
    const c = listOf("A", "B", "C");
    const moved = moveDisplayedItem(c, "i1", 2, false, LATER);
    expect(docIds(moved)).toEqual(["i2", "i3", "i1"]);
  });

  it("translates a display-order drop into a document move when sinking", () => {
    // Doc + view both [A, B, C]; check B so the view becomes [A, C, B].
    let c = listOf("A", "B", "C");
    c = toggleItem(c, "i2", "2026-01-01T00:00:01.000Z");
    expect(viewIds(c)).toEqual(["i1", "i3", "i2"]);
    // Drag A (display 0) to display index 1 — it should land after C in the
    // view, i.e. just before the checked group.
    const moved = moveDisplayedItem(c, "i1", 1, true, LATER);
    expect(viewIds(moved)).toEqual(["i3", "i1", "i2"]);
  });

  it("returns the checklist unchanged for an unknown item", () => {
    const c = listOf("A", "B");
    expect(moveDisplayedItem(c, "nope", 0, true, LATER)).toBe(c);
  });
});
