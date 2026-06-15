import { describe, expect, it } from "vitest";
import {
  addItem,
  createTemplate,
  removeItem,
  renameTemplate,
} from "../../src/domain/templates.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

describe("templates", () => {
  it("creates a template with trimmed name and no items", () => {
    const t = createTemplate({ id: "t1", name: "  Packing  ", now: NOW });
    expect(t.name).toBe("Packing");
    expect(t.items).toEqual([]);
    expect(t.createdAt).toBe(NOW);
    expect(t.updatedAt).toBe(NOW);
    expect(t.version).toBe(1);
  });

  it("adds and removes items immutably and bumps updatedAt", () => {
    const t = createTemplate({ id: "t1", name: "Packing", now: NOW });
    const withItem = addItem(t, { id: "i1", title: "Passport" }, LATER);
    expect(t.items).toHaveLength(0); // original untouched
    expect(withItem.items).toHaveLength(1);
    expect(withItem.updatedAt).toBe(LATER);

    const without = removeItem(withItem, "i1", LATER);
    expect(without.items).toHaveLength(0);
  });

  it("renames a template", () => {
    const t = createTemplate({ id: "t1", name: "Old", now: NOW });
    expect(renameTemplate(t, " New ", LATER).name).toBe("New");
  });
});
