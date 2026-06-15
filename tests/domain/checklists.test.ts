import { describe, expect, it } from "vitest";
import {
  activeItems,
  addItem,
  createChecklist,
  deleteItem,
  instantiate,
  isComplete,
  progress,
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

  it("archives an item without removing it, hiding it from the view", () => {
    const withItem = addItem(base, { id: "i1", title: "A" }, NOW);
    const archived = setArchived(withItem, "i1", true, NOW);
    expect(archived.items[0]?.archived).toBe(true);
    expect(activeItems(archived)).toHaveLength(0);
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
