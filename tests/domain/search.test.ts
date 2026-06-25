import { describe, expect, it } from "vitest";

import {
  buildSearchIndex,
  parseQuery,
  search,
  segmentMatches,
} from "../../src/domain/search.ts";
import type { Checklist, Snapshot } from "../../src/domain/types.ts";

// A minimal checklist factory — only the fields search reads.
function list(
  id: string,
  name: string,
  items: Checklist["items"],
  archived = false,
): Checklist {
  return {
    version: 1,
    id,
    templateId: "",
    name,
    items,
    archived: archived || undefined,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };
}

function snapshot(checklists: Checklist[]): Snapshot {
  return { templates: [], checklists };
}

const sample = snapshot([
  list("l1", "Grocery list", [
    { id: "i1", title: "Buy milk", checked: false, notes: "Whole milk, 2L" },
    {
      id: "i2",
      title: "Vegetables",
      checked: false,
      children: [
        { id: "i2a", title: "Carrots", checked: false },
        { id: "i2b", title: "Spinach", checked: true },
      ],
    },
    { id: "i3", title: "Old bread", checked: false, archived: true },
  ]),
  list("l2", "Weekend trip", [
    { id: "j1", title: "Pack sunscreen", checked: false },
  ]),
  list(
    "l3",
    "Archived plans",
    [{ id: "k1", title: "Secret", checked: false }],
    true,
  ),
]);

describe("buildSearchIndex", () => {
  it("indexes list names, item titles, and note bodies", () => {
    const { entries } = buildSearchIndex(sample);
    const checklistNames = entries
      .filter((e) => e.field === "checklist")
      .map((e) => e.text);
    expect(checklistNames).toEqual(["Grocery list", "Weekend trip"]);

    const noteEntry = entries.find((e) => e.field === "notes");
    expect(noteEntry?.text).toBe("Whole milk, 2L");
    expect(noteEntry?.itemId).toBe("i1");
  });

  it("includes nested children with their depth", () => {
    const { entries } = buildSearchIndex(sample);
    const carrots = entries.find((e) => e.itemId === "i2a");
    expect(carrots?.depth).toBe(1);
    expect(carrots?.field).toBe("item");
  });

  it("skips archived items and archived lists", () => {
    const { entries } = buildSearchIndex(sample);
    expect(entries.some((e) => e.itemId === "i3")).toBe(false); // archived item
    expect(entries.some((e) => e.checklistId === "l3")).toBe(false); // archived list
  });
});

describe("parseQuery", () => {
  it("classifies empty, text, wildcard, and regex queries", () => {
    expect(parseQuery("   ").kind).toBe("empty");
    expect(parseQuery("milk")).toMatchObject({
      kind: "matcher",
      matcher: { kind: "text" },
    });
    expect(parseQuery("car*")).toMatchObject({
      kind: "matcher",
      matcher: { kind: "wildcard" },
    });
    expect(parseQuery("/ca.+/")).toMatchObject({
      kind: "matcher",
      matcher: { kind: "regex" },
    });
  });

  it("reports an invalid regex literal", () => {
    expect(parseQuery("/(/").kind).toBe("invalid");
  });
});

describe("search", () => {
  const index = buildSearchIndex(sample);

  it("returns nothing for an empty query", () => {
    expect(search(index, "").results).toEqual([]);
  });

  it("finds an item by a substring of its title", () => {
    const { results } = search(index, "milk");
    expect(results).toHaveLength(1);
    expect(results[0]!.checklistId).toBe("l1");
    const titles = results[0]!.items.map((i) => i.title);
    expect(titles).toContain("Buy milk");
  });

  it("finds a checklist by its name and records the matched range", () => {
    const { results } = search(index, "grocery");
    const grocery = results.find((r) => r.checklistId === "l1");
    expect(grocery?.nameRanges).toEqual([[0, 7]]);
  });

  it("searches note bodies", () => {
    const { results } = search(index, "2L");
    const noteHit = results
      .flatMap((r) => r.items)
      .find((i) => i.field === "notes");
    expect(noteHit?.itemId).toBe("i1");
  });

  it("matches nested child items", () => {
    const { results } = search(index, "carrot");
    const hit = results.flatMap((r) => r.items).find((i) => i.itemId === "i2a");
    expect(hit).toBeTruthy();
    expect(hit?.depth).toBe(1);
  });

  it("supports wildcards", () => {
    const { results } = search(index, "veg*bles");
    const hit = results.flatMap((r) => r.items).find((i) => i.itemId === "i2");
    expect(hit).toBeTruthy();
  });

  it("supports regex literals", () => {
    const { results } = search(index, "/sun\\w+/");
    const hit = results.flatMap((r) => r.items).find((i) => i.itemId === "j1");
    expect(hit?.ranges).toEqual([[5, 14]]); // "sunscreen" within "Pack sunscreen"
  });

  it("flags an invalid regex instead of finding nothing silently", () => {
    const out = search(index, "/(/");
    expect(out.invalidRegex).toBe(true);
    expect(out.results).toEqual([]);
  });

  it("fuzzy-matches a subsequence when there is no substring hit", () => {
    const { results } = search(index, "grcl");
    expect(results.some((r) => r.checklistId === "l1")).toBe(true);
  });

  it("ranks list-name hits above incidental item hits", () => {
    const { results } = search(index, "trip");
    expect(results[0]!.checklistId).toBe("l2");
  });
});

describe("segmentMatches", () => {
  it("splits text into plain and matched segments", () => {
    const segs = segmentMatches("Buy milk", [[4, 8]]);
    expect(segs).toEqual([
      { text: "Buy ", match: false },
      { text: "milk", match: true },
    ]);
  });

  it("returns the whole string unmatched when there are no ranges", () => {
    expect(segmentMatches("plain", [])).toEqual([
      { text: "plain", match: false },
    ]);
  });
});
