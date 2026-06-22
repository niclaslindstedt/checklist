import { describe, expect, it } from "vitest";

import { reorderFlips } from "../../src/ui/hooks/useReorderFlip.ts";

describe("reorderFlips", () => {
  it("reports each moved row's delta as old top minus new top", () => {
    const prev = new Map([
      ["a", 0],
      ["b", 40],
      ["c", 80],
    ]);
    // "a" was checked and sank to the bottom: a→80, b→0, c→40.
    const next = new Map([
      ["b", 0],
      ["c", 40],
      ["a", 80],
    ]);
    const flips = reorderFlips(prev, next);
    expect(flips).toEqual(
      expect.arrayContaining([
        { id: "a", delta: -80 },
        { id: "b", delta: 40 },
        { id: "c", delta: 40 },
      ]),
    );
    expect(flips).toHaveLength(3);
  });

  it("skips rows that did not move", () => {
    const prev = new Map([
      ["a", 0],
      ["b", 40],
    ]);
    const next = new Map([
      ["a", 0],
      ["b", 40],
    ]);
    expect(reorderFlips(prev, next)).toEqual([]);
  });

  it("ignores newly mounted rows that have no previous position", () => {
    const prev = new Map([["a", 0]]);
    const next = new Map([
      ["a", 40],
      ["b", 0],
    ]);
    // Only "a" (present in both) animates; "b" is new, nothing to slide from.
    expect(reorderFlips(prev, next)).toEqual([{ id: "a", delta: -40 }]);
  });
});
