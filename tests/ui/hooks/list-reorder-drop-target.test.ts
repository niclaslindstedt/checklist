import { describe, expect, it } from "vitest";

import {
  resolveDropTarget,
  type Rect,
} from "../../../src/ui/hooks/useListReorder.ts";

// `resolveDropTarget` is the pure half of the drag hook: given the measured row
// geometry, the dragged id, and the finger's Y, it picks the row the drop lands
// against and whether it lands before / into / after it. The hook feeds it the
// *collapsed* snapshot — the dragged row already excluded — so these fixtures
// model a contiguous list with the dragged row removed, which is what lets a
// middle item land back in its own slot (the regression these tests pin down).

const H = 40;
const EDGE = H * 0.25; // matches EDGE_ZONE = 0.25

// A contiguous stack of rows, each H tall, starting at top 0.
function stack(...ids: string[]): Rect[] {
  return ids.map((id, i) => ({ id, top: i * H, height: H }));
}

const allow = () => true;

describe("resolveDropTarget", () => {
  // The original list is a,b,c,d,e and the user picked up c. Once c lifts out
  // of flow, d and e slide up, so the collapsed geometry the hook measures is
  // [a, b, d, e]. c's old slot is gone — the gap between b and d is now the
  // boundary between two adjacent rows, so the item is reachable back to where
  // it started instead of falling into a dead zone.
  const collapsed = stack("a", "b", "d", "e");

  it("drops after the row above its origin (restores the original slot)", () => {
    // Finger in the bottom edge of b — where c sat before being lifted.
    const bBottom = H + (H - EDGE / 2); // within b's bottom 25%
    expect(resolveDropTarget(collapsed, "c", bBottom, allow)).toEqual({
      id: "b",
      mode: "after",
    });
  });

  it("drops before the row below its origin (also restores the slot)", () => {
    // Finger in the top edge of d — the other half of the reopened boundary.
    const dTop = 2 * H + EDGE / 2; // within d's top 25%
    expect(resolveDropTarget(collapsed, "c", dTop, allow)).toEqual({
      id: "d",
      mode: "before",
    });
  });

  it("nests into a row when the finger sits in its middle band", () => {
    const bMiddle = H + H / 2;
    expect(resolveDropTarget(collapsed, "c", bMiddle, allow)).toEqual({
      id: "b",
      mode: "into",
    });
  });

  it("clamps before the first row past the top of the list", () => {
    expect(resolveDropTarget(collapsed, "c", -50, allow)).toEqual({
      id: "a",
      mode: "before",
    });
  });

  it("clamps after the last row past the bottom of the list", () => {
    expect(resolveDropTarget(collapsed, "c", 9999, allow)).toEqual({
      id: "e",
      mode: "after",
    });
  });

  it("skips rows the dragged item may not land on", () => {
    // c can't drop onto b (say b is c's own descendant): the finger over b
    // falls through to the nearest droppable neighbour instead of nesting.
    const canDrop = (_dragged: string, target: string) => target !== "b";
    const bMiddle = H + H / 2; // lower half of b → after the nearest neighbour
    expect(resolveDropTarget(collapsed, "c", bMiddle, canDrop)).toEqual({
      id: "d",
      mode: "after",
    });
  });

  it("returns null when no row is droppable", () => {
    expect(resolveDropTarget(stack("a"), "a", 20, allow)).toBeNull();
  });
});
