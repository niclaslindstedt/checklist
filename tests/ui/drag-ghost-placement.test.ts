import { describe, expect, it } from "vitest";

import type { DisplayRow } from "../../src/domain/checklists.ts";
import type { ChecklistItem } from "../../src/domain/types.ts";
import { ghostPlacement } from "../../src/ui/dragGhostPlacement.ts";
import type { DropTarget } from "../../src/ui/hooks/useListReorder.ts";

// `ghostPlacement` resolves a live drop target into the flow index + indent at
// which the drag-ghost preview snaps in — mirroring where `moveItemInto` will
// actually land the row. Driven here over hand-built flattened rows (no DOM).

const item = (id: string): ChecklistItem => ({
  id,
  title: id,
  checked: false,
});

const row = (id: string, depth: number, hasChildren = false): DisplayRow => ({
  item: item(id),
  depth,
  hasChildren,
});

const target = (id: string, mode: DropTarget["mode"]): DropTarget => ({
  id,
  mode,
});

describe("ghostPlacement", () => {
  it("returns null with no target", () => {
    expect(ghostPlacement([row("a", 0)], null)).toBeNull();
  });

  it("returns null when the target row isn't visible", () => {
    expect(ghostPlacement([row("a", 0)], target("ghostly", "into"))).toBeNull();
  });

  it("'before' sits just above the target, at the target's depth", () => {
    const rows = [row("a", 0), row("b", 0)];
    expect(ghostPlacement(rows, target("b", "before"))).toEqual({
      index: 1,
      depth: 0,
    });
  });

  it("'after' on a leaf sits in the next slot, as a sibling", () => {
    const rows = [row("a", 0), row("b", 0)];
    expect(ghostPlacement(rows, target("a", "after"))).toEqual({
      index: 1,
      depth: 0,
    });
  });

  it("'after' on a parent skips its whole visible subtree", () => {
    // a holds child a1 (which itself holds a1a); dropping after `a` must land
    // below the entire subtree, as a's sibling at depth 0.
    const rows = [
      row("a", 0, true),
      row("a1", 1, true),
      row("a1a", 2),
      row("b", 0),
    ];
    expect(ghostPlacement(rows, target("a", "after"))).toEqual({
      index: 3,
      depth: 0,
    });
  });

  it("'into' a leaf indents one level, right below it", () => {
    const rows = [row("a", 0), row("b", 0)];
    expect(ghostPlacement(rows, target("a", "into"))).toEqual({
      index: 1,
      depth: 1,
    });
  });

  it("'into' a parent appends after its existing children, indented a level", () => {
    const rows = [row("a", 0, true), row("a1", 1), row("b", 0)];
    expect(ghostPlacement(rows, target("a", "into"))).toEqual({
      index: 2,
      depth: 1,
    });
  });

  it("'into' a deeper row nests one level below that row", () => {
    const rows = [row("a", 0, true), row("a1", 1), row("b", 0)];
    expect(ghostPlacement(rows, target("a1", "into"))).toEqual({
      index: 2,
      depth: 2,
    });
  });

  it("places the ghost at the list end when the target is last", () => {
    const rows = [row("a", 0), row("b", 0)];
    expect(ghostPlacement(rows, target("b", "after"))).toEqual({
      index: 2,
      depth: 0,
    });
  });
});
