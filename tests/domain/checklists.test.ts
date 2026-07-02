import { describe, expect, it } from "vitest";
import {
  activeChecklists,
  activeItems,
  addItem,
  addItemAfter,
  addItems,
  addItemsAfter,
  archiveChecked,
  archivedByChecklist,
  archivedChecklists,
  archivedItems,
  createChecklist,
  deleteChecked,
  deleteItem,
  displayItems,
  editItem,
  findItem,
  flattenForDisplay,
  flattenItems,
  instantiate,
  isComplete,
  moveDisplayedItem,
  moveItem,
  moveItemInto,
  nextChecklistName,
  progress,
  renameChecklist,
  setAllChecked,
  setArchived,
  setChecklistAppearance,
  setChecklistArchived,
  sortCheckedToBottom,
  toggleItem,
} from "../../src/domain/checklists.ts";
import { createTemplate } from "../../src/domain/templates.ts";
import type {
  Checklist,
  ChecklistItem,
  Template,
} from "../../src/domain/types.ts";

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

  it("nests a new item under a parent when given a parentId", () => {
    let c = addItem(base, { id: "p", title: "Parent" }, NOW);
    c = addItem(c, { id: "k1", title: "Kid 1" }, NOW, "bottom", "p");
    c = addItem(c, { id: "k2", title: "Kid 2" }, NOW, "bottom", "p");
    // Stays a single top-level item carrying both children, in order.
    expect(c.items.map((i) => i.id)).toEqual(["p"]);
    expect(c.items[0]?.children?.map((i) => i.id)).toEqual(["k1", "k2"]);
    expect(c.items[0]?.children?.[0]).toEqual({
      id: "k1",
      title: "Kid 1",
      checked: false,
    });
  });

  it("honours 'top' position within a parent's children", () => {
    let c = addItem(base, { id: "p", title: "Parent" }, NOW);
    c = addItem(c, { id: "k1", title: "Kid 1" }, NOW, "bottom", "p");
    c = addItem(c, { id: "k2", title: "Kid 2" }, NOW, "top", "p");
    expect(c.items[0]?.children?.map((i) => i.id)).toEqual(["k2", "k1"]);
  });

  it("nests under a deeper sub-item too", () => {
    let c = addItem(base, { id: "p", title: "Parent" }, NOW);
    c = addItem(c, { id: "k", title: "Kid" }, NOW, "bottom", "p");
    c = addItem(c, { id: "g", title: "Grandkid" }, NOW, "bottom", "k");
    expect(c.items[0]?.children?.[0]?.children?.map((i) => i.id)).toEqual([
      "g",
    ]);
  });

  it("falls back to a top-level add when the parentId is unknown", () => {
    let c = addItem(base, { id: "i1", title: "A" }, NOW);
    c = addItem(c, { id: "i2", title: "B" }, NOW, "bottom", "ghost");
    expect(c.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(c.items[1]?.children).toBeUndefined();
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

  it("is a no-op when the archived state is unchanged (same reference)", () => {
    const later = "2026-02-02T00:00:00.000Z";
    const withItem = addItem(base, { id: "i1", title: "A" }, NOW);
    // Restoring an already-active item, and archiving an already-archived one,
    // both leave the document untouched — no updatedAt bump, no write.
    expect(setArchived(withItem, "i1", false, later)).toBe(withItem);
    const archived = setArchived(withItem, "i1", true, NOW);
    expect(setArchived(archived, "i1", true, later)).toBe(archived);
    // An unknown id can't change anything either.
    expect(setArchived(withItem, "ghost", true, later)).toBe(withItem);
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

  it("appends imported items under a parent when given a parentId", () => {
    const seeded = addItem(base, { id: "p", title: "Parent" }, NOW);
    const next = addItems(
      seeded,
      [
        { id: "k1", title: "Milk", checked: false },
        { id: "k2", title: "Bread", checked: true },
      ],
      NOW,
      "p",
    );
    expect(next.items.map((i) => i.id)).toEqual(["p"]);
    expect(next.items[0]?.children?.map((i) => i.id)).toEqual(["k1", "k2"]);
  });

  it("falls back to a top-level append when the parentId is unknown", () => {
    const seeded = addItem(base, { id: "i0", title: "Existing" }, NOW);
    const next = addItems(
      seeded,
      [{ id: "i1", title: "Milk", checked: false }],
      NOW,
      "ghost",
    );
    expect(next.items.map((i) => i.id)).toEqual(["i0", "i1"]);
  });
});

describe("addItemAfter", () => {
  const base = createChecklist("c1", "List", NOW);
  const seeded = (() => {
    let c = addItem(base, { id: "a", title: "A" }, NOW);
    c = addItem(c, { id: "b", title: "B" }, NOW);
    c = addItem(c, { id: "c", title: "C" }, NOW);
    return c;
  })();

  it("inserts a trimmed, unchecked item right after the sibling", () => {
    const next = addItemAfter(seeded, { id: "x", title: "  X  " }, "a", NOW);
    expect(next.items.map((i) => i.id)).toEqual(["a", "x", "b", "c"]);
    expect(next.items[1]).toEqual({ id: "x", title: "X", checked: false });
    expect(next.updatedAt).toBe(NOW);
    // Immutable — the source list is untouched.
    expect(seeded.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("inserts after the last item, landing at the bottom", () => {
    const next = addItemAfter(seeded, { id: "x", title: "X" }, "c", NOW);
    expect(next.items.map((i) => i.id)).toEqual(["a", "b", "c", "x"]);
  });

  it("inserts as a sibling at the nested item's own depth", () => {
    let c = addItem(base, { id: "p", title: "Parent" }, NOW);
    c = addItem(c, { id: "k1", title: "Kid 1" }, NOW, "bottom", "p");
    c = addItem(c, { id: "k2", title: "Kid 2" }, NOW, "bottom", "p");
    // Insert after k1 — it lands between the two children, not at the top level.
    const next = addItemAfter(c, { id: "kx", title: "Kid X" }, "k1", NOW);
    expect(next.items.map((i) => i.id)).toEqual(["p"]);
    expect(next.items[0]?.children?.map((i) => i.id)).toEqual([
      "k1",
      "kx",
      "k2",
    ]);
  });

  it("falls back to a bottom append when the afterId is unknown", () => {
    const next = addItemAfter(seeded, { id: "x", title: "X" }, "ghost", NOW);
    expect(next.items.map((i) => i.id)).toEqual(["a", "b", "c", "x"]);
  });
});

describe("addItemsAfter", () => {
  const base = createChecklist("c1", "List", NOW);
  const seeded = (() => {
    let c = addItem(base, { id: "a", title: "A" }, NOW);
    c = addItem(c, { id: "b", title: "B" }, NOW);
    return c;
  })();

  it("splices many items after the sibling, in order", () => {
    const next = addItemsAfter(
      seeded,
      [
        { id: "x", title: "X", checked: false },
        { id: "y", title: "Y", checked: true, notes: "note" },
      ],
      "a",
      NOW,
    );
    expect(next.items.map((i) => i.id)).toEqual(["a", "x", "y", "b"]);
    // Checked state and notes survive the splice (unlike addItem).
    expect(next.items[2]).toEqual({
      id: "y",
      title: "Y",
      checked: true,
      notes: "note",
    });
  });

  it("is a no-op (same reference) when given no items", () => {
    expect(addItemsAfter(seeded, [], "a", NOW)).toBe(seeded);
  });

  it("falls back to a bottom append when the afterId is unknown", () => {
    const next = addItemsAfter(
      seeded,
      [{ id: "x", title: "X", checked: false }],
      "ghost",
      NOW,
    );
    expect(next.items.map((i) => i.id)).toEqual(["a", "b", "x"]);
  });
});

describe("setChecklistArchived", () => {
  const NOW = "2026-01-01T00:00:00.000Z";
  const LATER = "2026-02-02T00:00:00.000Z";
  const base = createChecklist("c1", "Groceries", NOW);

  it("marks a checklist archived and bumps updatedAt", () => {
    const archived = setChecklistArchived(base, true, LATER);
    expect(archived.archived).toBe(true);
    expect(archived.updatedAt).toBe(LATER);
    // Source untouched.
    expect(base.archived).toBeUndefined();
  });

  it("is a no-op when already in the requested state", () => {
    expect(setChecklistArchived(base, false, LATER)).toBe(base);
    const archived = setChecklistArchived(base, true, LATER);
    expect(setChecklistArchived(archived, true, NOW)).toBe(archived);
  });

  it("restores by dropping the flag entirely (round-trips clean)", () => {
    const archived = setChecklistArchived(base, true, LATER);
    const restored = setChecklistArchived(archived, false, NOW);
    expect("archived" in restored).toBe(false);
    expect(restored.updatedAt).toBe(NOW);
  });
});

describe("setChecklistAppearance", () => {
  const NOW = "2026-01-01T00:00:00.000Z";
  const LATER = "2026-02-02T00:00:00.000Z";
  const base = createChecklist("c1", "Groceries", NOW);

  it("sets a glyph and a colour and bumps updatedAt", () => {
    const styled = setChecklistAppearance(
      base,
      { glyph: "cart", color: "#98c379" },
      LATER,
    );
    expect(styled.glyph).toBe("cart");
    expect(styled.color).toBe("#98c379");
    expect(styled.updatedAt).toBe(LATER);
    // Source untouched.
    expect(base.glyph).toBeUndefined();
    expect(base.color).toBeUndefined();
  });

  it("touches only the fields present in the patch", () => {
    const withGlyph = setChecklistAppearance(base, { glyph: "cart" }, LATER);
    const withColor = setChecklistAppearance(
      withGlyph,
      { color: "#98c379" },
      LATER,
    );
    expect(withColor.glyph).toBe("cart");
    expect(withColor.color).toBe("#98c379");
  });

  it("clears a field with null, dropping the key entirely", () => {
    const styled = setChecklistAppearance(
      base,
      { glyph: "cart", color: "#98c379" },
      NOW,
    );
    const cleared = setChecklistAppearance(styled, { glyph: null }, LATER);
    expect("glyph" in cleared).toBe(false);
    expect(cleared.color).toBe("#98c379");
    expect(cleared.updatedAt).toBe(LATER);
  });

  it("clears the colour with null, keeping the glyph and bumping updatedAt", () => {
    const styled = setChecklistAppearance(
      base,
      { glyph: "cart", color: "#98c379" },
      NOW,
    );
    const cleared = setChecklistAppearance(styled, { color: null }, LATER);
    expect("color" in cleared).toBe(false);
    expect(cleared.glyph).toBe("cart");
    expect(cleared.updatedAt).toBe(LATER);
  });

  it("is a no-op when nothing changes (same reference, no updatedAt bump)", () => {
    expect(setChecklistAppearance(base, {}, LATER)).toBe(base);
    expect(setChecklistAppearance(base, { glyph: null }, LATER)).toBe(base);
    expect(setChecklistAppearance(base, { color: null }, LATER)).toBe(base);
    const styled = setChecklistAppearance(base, { glyph: "cart" }, NOW);
    expect(setChecklistAppearance(styled, { glyph: "cart" }, LATER)).toBe(
      styled,
    );
    const colored = setChecklistAppearance(base, { color: "#98c379" }, NOW);
    expect(setChecklistAppearance(colored, { color: "#98c379" }, LATER)).toBe(
      colored,
    );
  });

  it("treats an empty-string value as a clear", () => {
    const styled = setChecklistAppearance(base, { glyph: "cart" }, NOW);
    const cleared = setChecklistAppearance(styled, { glyph: "" }, LATER);
    expect("glyph" in cleared).toBe(false);
  });
});

describe("active / archived checklist selectors", () => {
  const NOW = "2026-01-01T00:00:00.000Z";
  const a = createChecklist("a", "Active 1", NOW);
  const b = setChecklistArchived(
    createChecklist("b", "Archived", NOW),
    true,
    NOW,
  );
  const c = createChecklist("c", "Active 2", NOW);
  const snapshot = { templates: [], checklists: [a, b, c] };

  it("splits the document into active and archived lists in order", () => {
    expect(activeChecklists(snapshot).map((l) => l.id)).toEqual(["a", "c"]);
    expect(archivedChecklists(snapshot).map((l) => l.id)).toEqual(["b"]);
  });

  it("excludes a wholly-archived list from the item archive groups", () => {
    // Archive an item inside the archived list `b`; it must not surface as an
    // item group, since the whole list is shown as a unit instead.
    let archivedList = addItem(b, { id: "bi", title: "buried" }, NOW);
    archivedList = setArchived(archivedList, "bi", true, NOW);
    // …and an archived item inside the active list `a` still shows.
    let activeList = addItem(a, { id: "ai", title: "shown" }, NOW);
    activeList = setArchived(activeList, "ai", true, NOW);
    const groups = archivedByChecklist({
      templates: [],
      checklists: [activeList, archivedList, c],
    });
    expect(groups.map((g) => g.id)).toEqual(["a"]);
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

describe("setAllChecked", () => {
  const CHECK_AT = "2026-04-04T00:00:00.000Z";

  function listOf(...titles: string[]) {
    let c = createChecklist("c1", "List", NOW);
    titles.forEach((t, i) => {
      c = addItem(c, { id: `i${i + 1}`, title: t }, NOW);
    });
    return c;
  }

  it("checks every item and stamps checkedAt", () => {
    let c = listOf("A", "B", "C");
    c = toggleItem(c, "i2", "2026-01-01T00:00:01.000Z"); // one already checked
    const all = setAllChecked(c, true, CHECK_AT);
    expect(all.items.every((it) => it.checked)).toBe(true);
    // The freshly-checked items pick up the new stamp; the already-checked
    // one keeps its original timestamp (no-op on it).
    expect(all.items[0]?.checkedAt).toBe(CHECK_AT);
    expect(all.items[1]?.checkedAt).toBe("2026-01-01T00:00:01.000Z");
    expect(all.updatedAt).toBe(CHECK_AT);
  });

  it("unchecks every item and clears checkedAt", () => {
    let c = listOf("A", "B");
    c = setAllChecked(c, true, CHECK_AT);
    const none = setAllChecked(c, false, "2026-05-05T00:00:00.000Z");
    expect(none.items.every((it) => !it.checked)).toBe(true);
    expect(none.items.every((it) => it.checkedAt === undefined)).toBe(true);
  });

  it("is a no-op (same reference) when every item already matches", () => {
    const c = listOf("A", "B");
    // Nothing checked → uncheck-all changes nothing.
    expect(setAllChecked(c, false, CHECK_AT)).toBe(c);
    const all = setAllChecked(c, true, CHECK_AT);
    // Everything checked → check-all changes nothing.
    expect(setAllChecked(all, true, "2026-06-06T00:00:00.000Z")).toBe(all);
  });

  it("leaves archived items and their subtrees untouched", () => {
    let c = listOf("A", "B", "C");
    c = setArchived(c, "i2", true, NOW);
    const all = setAllChecked(c, true, CHECK_AT);
    expect(findItem(all.items, "i1")?.checked).toBe(true);
    expect(findItem(all.items, "i3")?.checked).toBe(true);
    // The archived item is hidden from the count, so it stays unchecked.
    expect(findItem(all.items, "i2")?.checked).toBe(false);
  });

  it("cascades through nested sub-items", () => {
    let c = listOf("Parent", "Child1", "Child2");
    c = moveItemInto(c, "i2", "i1", "into", NOW);
    c = moveItemInto(c, "i3", "i1", "into", NOW);
    const all = setAllChecked(c, true, CHECK_AT);
    const parent = all.items[0]!;
    expect(parent.checked).toBe(true);
    expect(parent.children?.every((it) => it.checked)).toBe(true);
  });
});

describe("nested sub-items", () => {
  const LATER = "2026-02-02T00:00:00.000Z";

  // A list of three flat items A/B/C as a starting point for nesting.
  function listOf(...titles: string[]): Checklist {
    let c = createChecklist("c1", "List", NOW);
    titles.forEach((t, i) => {
      c = addItem(c, { id: `i${i + 1}`, title: t }, NOW);
    });
    return c;
  }

  describe("moveItemInto", () => {
    it("nests the dragged item as the target's last child on 'into'", () => {
      const c = listOf("A", "B", "C");
      const moved = moveItemInto(c, "i3", "i1", "into", LATER);
      expect(moved.items.map((it) => it.id)).toEqual(["i1", "i2"]);
      expect(moved.items[0]!.children?.map((it) => it.id)).toEqual(["i3"]);
      expect(moved.updatedAt).toBe(LATER);
    });

    it("appends to existing children, keeping order", () => {
      let c = listOf("A", "B", "C");
      c = moveItemInto(c, "i2", "i1", "into", NOW);
      c = moveItemInto(c, "i3", "i1", "into", NOW);
      expect(c.items.map((it) => it.id)).toEqual(["i1"]);
      expect(c.items[0]!.children?.map((it) => it.id)).toEqual(["i2", "i3"]);
    });

    it("drops as a sibling before / after the target", () => {
      const c = listOf("A", "B", "C");
      expect(
        moveItemInto(c, "i3", "i1", "before", NOW).items.map((it) => it.id),
      ).toEqual(["i3", "i1", "i2"]);
      expect(
        moveItemInto(c, "i1", "i3", "after", NOW).items.map((it) => it.id),
      ).toEqual(["i2", "i3", "i1"]);
    });

    it("carries the dragged item's own subtree along", () => {
      let c = listOf("A", "B", "C");
      c = moveItemInto(c, "i2", "i1", "into", NOW); // B under A
      // Now drag A (with child B) under C.
      c = moveItemInto(c, "i1", "i3", "into", NOW);
      expect(c.items.map((it) => it.id)).toEqual(["i3"]);
      const a = c.items[0]!.children?.[0];
      expect(a?.id).toBe("i1");
      expect(a?.children?.map((it) => it.id)).toEqual(["i2"]);
    });

    it("refuses to drop an item into its own descendant (no-op)", () => {
      let c = listOf("A", "B");
      c = moveItemInto(c, "i2", "i1", "into", NOW); // B under A
      const tried = moveItemInto(c, "i1", "i2", "into", LATER);
      expect(tried).toBe(c);
    });

    it("is a no-op for self-drop, unknown ids, and a positional non-move", () => {
      const c = listOf("A", "B", "C");
      expect(moveItemInto(c, "i1", "i1", "into", LATER)).toBe(c);
      expect(moveItemInto(c, "nope", "i1", "into", LATER)).toBe(c);
      expect(moveItemInto(c, "i9", "i1", "into", LATER)).toBe(c);
      // Dropping i1 before i2 is where it already sits — no change.
      expect(moveItemInto(c, "i1", "i2", "before", LATER)).toBe(c);
    });
  });

  describe("toggleItem cascade", () => {
    function nested(): Checklist {
      let c = listOf("Parent", "Child1", "Child2");
      c = moveItemInto(c, "i2", "i1", "into", NOW);
      c = moveItemInto(c, "i3", "i1", "into", NOW);
      return c;
    }

    it("checking a parent checks its whole subtree", () => {
      const c = toggleItem(nested(), "i1", LATER);
      const parent = c.items[0]!;
      expect(parent.checked).toBe(true);
      expect(parent.checkedAt).toBe(LATER);
      expect(parent.children?.every((it) => it.checked)).toBe(true);
      expect(parent.children?.every((it) => it.checkedAt === LATER)).toBe(true);
    });

    it("unchecking a parent clears the subtree and its timestamps", () => {
      let c = toggleItem(nested(), "i1", LATER);
      c = toggleItem(c, "i1", "2026-03-03T00:00:00.000Z");
      const parent = c.items[0]!;
      expect(parent.checked).toBe(false);
      expect(parent.checkedAt).toBeUndefined();
      expect(parent.children?.some((it) => it.checked)).toBe(false);
      expect(parent.children?.some((it) => it.checkedAt !== undefined)).toBe(
        false,
      );
    });

    it("toggles a single child without touching its parent", () => {
      const c = toggleItem(nested(), "i2", LATER);
      expect(c.items[0]!.checked).toBe(false);
      expect(findItem(c.items, "i2")?.checked).toBe(true);
    });
  });

  it("deletes an item together with its subtree", () => {
    let c = listOf("A", "B");
    c = moveItemInto(c, "i2", "i1", "into", NOW);
    const after = deleteItem(c, "i1", LATER);
    expect(after.items).toHaveLength(0);
    expect(findItem(after.items, "i2")).toBeUndefined();
  });

  it("counts progress over the whole tree, sub-items included", () => {
    let c = listOf("A", "B", "C");
    c = moveItemInto(c, "i2", "i1", "into", NOW); // B under A
    c = toggleItem(c, "i2", NOW); // check the child
    expect(progress(c)).toEqual({ checked: 1, total: 3 });
  });

  it("requires every nested required item to be complete", () => {
    let c = listOf("A", "B");
    c = moveItemInto(c, "i2", "i1", "into", NOW);
    c = {
      ...c,
      items: c.items.map((it) =>
        withChild(it, (child) =>
          child.id === "i2" ? { ...child, required: true } : child,
        ),
      ),
    };
    expect(isComplete(c)).toBe(false);
    expect(isComplete(toggleItem(c, "i2", NOW))).toBe(true);
  });

  describe("archive across the tree", () => {
    function nested(): Checklist {
      let c = listOf("Parent", "Child");
      c = moveItemInto(c, "i2", "i1", "into", NOW);
      return c;
    }

    it("hides an archived parent's subtree from the active view", () => {
      const c = setArchived(nested(), "i1", true, LATER);
      expect(activeItems(c)).toHaveLength(0);
      // The archive lists the archived root; its child travels with it.
      expect(archivedItems(c).map((it) => it.id)).toEqual(["i1"]);
      expect(archivedItems(c)[0]!.children?.[0]!.id).toBe("i2");
    });

    it("prunes an archived child out of its active parent", () => {
      const c = setArchived(nested(), "i2", true, LATER);
      expect(activeItems(c).map((it) => it.id)).toEqual(["i1"]);
      expect(activeItems(c)[0]!.children ?? []).toHaveLength(0);
      expect(archivedItems(c).map((it) => it.id)).toEqual(["i2"]);
    });

    it("sweeps finished sub-items with archive / delete finished", () => {
      let c = nested();
      c = toggleItem(c, "i2", NOW); // finish the child
      expect(archivedItems(archiveChecked(c, NOW)).map((it) => it.id)).toEqual([
        "i2",
      ]);
      expect(findItem(deleteChecked(c, NOW).items, "i2")).toBeUndefined();
    });
  });

  it("sorts checked items to the bottom within each sub-list", () => {
    let c = listOf("Parent", "X", "Y", "Z");
    c = moveItemInto(c, "i2", "i1", "into", NOW); // X under Parent
    c = moveItemInto(c, "i3", "i1", "into", NOW); // Y under Parent
    c = moveItemInto(c, "i4", "i1", "into", NOW); // Z under Parent
    c = toggleItem(c, "i2", "2026-01-01T00:00:01.000Z"); // check X
    const sorted = sortCheckedToBottom(activeItems(c));
    // Within the parent's sub-list, unchecked Y, Z come first, X sinks.
    expect(sorted[0]!.children?.map((it) => it.id)).toEqual(["i3", "i4", "i2"]);
  });

  describe("flattenForDisplay", () => {
    function nested(): Checklist {
      let c = listOf("A", "B", "C");
      c = moveItemInto(c, "i2", "i1", "into", NOW); // B under A
      c = moveItemInto(c, "i3", "i1", "into", NOW); // C under A
      return c;
    }

    it("tags each row with its depth and whether it has children", () => {
      const rows = flattenForDisplay(activeItems(nested()), new Set());
      expect(rows.map((r) => [r.item.id, r.depth, r.hasChildren])).toEqual([
        ["i1", 0, true],
        ["i2", 1, false],
        ["i3", 1, false],
      ]);
    });

    it("skips the children of a collapsed item", () => {
      const rows = flattenForDisplay(activeItems(nested()), new Set(["i1"]));
      expect(rows.map((r) => r.item.id)).toEqual(["i1"]);
    });
  });

  it("flattenItems walks parents before their children, depth-first", () => {
    let c = listOf("A", "B", "C");
    c = moveItemInto(c, "i2", "i1", "into", NOW);
    c = moveItemInto(c, "i3", "i2", "into", NOW);
    expect(flattenItems(c.items).map((it) => it.id)).toEqual([
      "i1",
      "i2",
      "i3",
    ]);
  });
});

// Helper: map an item's children, preserving the rest of the node.
function withChild(
  item: ChecklistItem,
  fn: (child: ChecklistItem) => ChecklistItem,
): ChecklistItem {
  if (!item.children) return item;
  return { ...item, children: item.children.map(fn) };
}

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
