import { describe, expect, it } from "vitest";

import {
  MAX_SUGGESTIONS,
  archivedTitlePool,
  suggestTitles,
  type TitleCount,
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

/** A one-off pool entry, or with an explicit usage count. */
function tc(title: string, count = 1): TitleCount {
  return { title, count };
}

describe("archivedTitlePool", () => {
  it("collects archived titles in document order, each counted once", () => {
    const c = list([
      item("a", "Milk"),
      item("b", "Carrots", { archived: true }),
      item("c", "Car", { archived: true }),
    ]);
    expect(archivedTitlePool(c)).toEqual([tc("Carrots"), tc("Car")]);
  });

  it("includes the descendants of an archived subtree", () => {
    const c = list([
      item("a", "Dinner", {
        archived: true,
        children: [item("b", "Pasta"), item("c", "Sauce")],
      }),
    ]);
    expect(archivedTitlePool(c)).toEqual([
      tc("Dinner"),
      tc("Pasta"),
      tc("Sauce"),
    ]);
  });

  it("tallies duplicate archived titles into a usage count", () => {
    const c = list([
      item("a", "Milk", { archived: true }),
      item("b", "Carrots", { archived: true }),
      item("c", "Milk", { archived: true }),
      item("d", "Milk", { archived: true }),
    ]);
    // Milk was archived three times; it keeps its first-occurrence position
    // in the pool but carries a count of 3.
    expect(archivedTitlePool(c)).toEqual([tc("Milk", 3), tc("Carrots", 1)]);
  });

  it("dedupes case-insensitively, keeping the first spelling and summing", () => {
    const c = list([
      item("a", "Carrots", { archived: true }),
      item("b", "carrots", { archived: true }),
    ]);
    expect(archivedTitlePool(c)).toEqual([tc("Carrots", 2)]);
  });

  it("excludes titles already on the active list", () => {
    const c = list([
      item("a", "Milk"),
      item("b", "milk", { archived: true }),
      item("c", "Bread", { archived: true }),
    ]);
    expect(archivedTitlePool(c)).toEqual([tc("Bread")]);
  });

  it("skips blank titles", () => {
    const c = list([item("a", "   ", { archived: true })]);
    expect(archivedTitlePool(c)).toEqual([]);
  });
});

describe("suggestTitles", () => {
  const pool: TitleCount[] = [
    tc("Car"),
    tc("Carrots"),
    tc("Vinegar"),
    tc("Bread"),
  ];

  it("matches by substring, case-insensitively", () => {
    const titles = suggestTitles(pool, "car").map((s) => s.title);
    expect(titles).toContain("Car");
    expect(titles).toContain("Carrots");
    expect(titles).not.toContain("Bread");
  });

  it("places the most-used matching title first", () => {
    const p = [tc("Car", 1), tc("Carrots", 5)];
    const titles = suggestTitles(p, "car").map((s) => s.title);
    expect(titles).toEqual(["Carrots", "Car"]);
  });

  it("ranks a prefix match above a more-used mid-word match", () => {
    // "Jordgubbar" only contains a "b" mid-word but has been used far more
    // often; "Bananer" starts with the typed "B". The prefix wins anyway.
    const p = [tc("Jordgubbar", 10), tc("Bananer", 1)];
    const titles = suggestTitles(p, "B").map((s) => s.title);
    expect(titles).toEqual(["Bananer", "Jordgubbar"]);
  });

  it("orders prefix matches among themselves by usage count", () => {
    const p = [tc("Bread", 1), tc("Bananer", 5)];
    const titles = suggestTitles(p, "B").map((s) => s.title);
    expect(titles).toEqual(["Bananer", "Bread"]);
  });

  it("carries the usage count on each suggestion", () => {
    const [first] = suggestTitles([tc("Carrots", 4)], "car");
    expect(first).toBeDefined();
    expect(first!.count).toBe(4);
  });

  it("ranks a word-start hit above a mid-word one when counts tie", () => {
    const titles = suggestTitles([tc("Scarf"), tc("Carrots")], "car").map(
      (s) => s.title,
    );
    expect(titles).toEqual(["Carrots", "Scarf"]);
  });

  it("returns the ranges to highlight", () => {
    const [first] = suggestTitles([tc("Carrots")], "car");
    expect(first).toBeDefined();
    expect(first!.ranges).toEqual([[0, 3]]);
  });

  it("falls back to fuzzy subsequence matching", () => {
    const [hit] = suggestTitles([tc("Grocery list")], "grcl");
    expect(hit).toBeDefined();
    expect(hit!.title).toBe("Grocery list");
  });

  it("suggests nothing for an empty or blank draft", () => {
    expect(suggestTitles(pool, "")).toEqual([]);
    expect(suggestTitles(pool, "   ")).toEqual([]);
  });

  it("caps the list at the limit", () => {
    const wide = Array.from({ length: 20 }, (_, i) => tc(`Carton ${i}`));
    expect(suggestTitles(wide, "car")).toHaveLength(MAX_SUGGESTIONS);
    expect(suggestTitles(wide, "car", 2)).toHaveLength(2);
  });
});
