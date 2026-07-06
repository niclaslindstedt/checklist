import { describe, expect, it } from "vitest";

import {
  MAX_SUGGESTIONS,
  archivedTitlePool,
  suggestTitles,
} from "../../src/domain/suggestions.ts";
import type { Checklist, ChecklistItem } from "../../src/domain/types.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function item(
  id: string,
  title: string,
  over: Partial<ChecklistItem> = {},
): ChecklistItem {
  return { id, title, checked: false, ...over };
}

function list(items: ChecklistItem[]): Checklist {
  return {
    version: 1,
    id: "c1",
    templateId: "",
    name: "Groceries",
    items,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("archivedTitlePool", () => {
  it("collects archived titles in document order", () => {
    const c = list([
      item("a", "Milk"),
      item("b", "Carrots", { archived: true }),
      item("c", "Car", { archived: true }),
    ]);
    expect(archivedTitlePool(c)).toEqual(["Carrots", "Car"]);
  });

  it("includes the descendants of an archived subtree", () => {
    const c = list([
      item("a", "Dinner", {
        archived: true,
        children: [item("b", "Pasta"), item("c", "Sauce")],
      }),
    ]);
    expect(archivedTitlePool(c)).toEqual(["Dinner", "Pasta", "Sauce"]);
  });

  it("dedupes case-insensitively, keeping the first spelling", () => {
    const c = list([
      item("a", "Carrots", { archived: true }),
      item("b", "carrots", { archived: true }),
    ]);
    expect(archivedTitlePool(c)).toEqual(["Carrots"]);
  });

  it("excludes titles already on the active list", () => {
    const c = list([
      item("a", "Milk"),
      item("b", "milk", { archived: true }),
      item("c", "Bread", { archived: true }),
    ]);
    expect(archivedTitlePool(c)).toEqual(["Bread"]);
  });

  it("skips blank titles", () => {
    const c = list([item("a", "   ", { archived: true })]);
    expect(archivedTitlePool(c)).toEqual([]);
  });
});

describe("suggestTitles", () => {
  const pool = ["Car", "Carrots", "Vinegar", "Bread"];

  it("matches by substring, case-insensitively", () => {
    const titles = suggestTitles(pool, "car").map((s) => s.title);
    expect(titles).toContain("Car");
    expect(titles).toContain("Carrots");
    expect(titles).not.toContain("Bread");
  });

  it("ranks a word-start hit above a mid-word one", () => {
    const titles = suggestTitles(["Scarf", "Carrots"], "car").map(
      (s) => s.title,
    );
    expect(titles).toEqual(["Carrots", "Scarf"]);
  });

  it("returns the ranges to highlight", () => {
    const [first] = suggestTitles(["Carrots"], "car");
    expect(first).toBeDefined();
    expect(first!.ranges).toEqual([[0, 3]]);
  });

  it("falls back to fuzzy subsequence matching", () => {
    const [hit] = suggestTitles(["Grocery list"], "grcl");
    expect(hit).toBeDefined();
    expect(hit!.title).toBe("Grocery list");
  });

  it("suggests nothing for an empty or blank draft", () => {
    expect(suggestTitles(pool, "")).toEqual([]);
    expect(suggestTitles(pool, "   ")).toEqual([]);
  });

  it("caps the list at the limit", () => {
    const wide = Array.from({ length: 20 }, (_, i) => `Carton ${i}`);
    expect(suggestTitles(wide, "car")).toHaveLength(MAX_SUGGESTIONS);
    expect(suggestTitles(wide, "car", 2)).toHaveLength(2);
  });
});
