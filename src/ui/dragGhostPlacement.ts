import type { DisplayRow } from "../domain/checklists.ts";
import type { DropTarget } from "./hooks/useListReorder.ts";

// Where the drag ghost preview lands in the flattened row list. Pure (no DOM),
// so it's unit-testable on its own; the view splices the ghost in at `index`
// and indents it to `depth`.

/** Where in the flattened row list the ghost preview belongs. */
export interface GhostPlacement {
  /** Splice index into the rendered rows — render the ghost before this row. */
  index: number;
  /** Indent depth for the ghost (a level deeper than the target for "into"). */
  depth: number;
}

// Resolve a live drop target into the ghost's flow position + indent, mirroring
// what `moveItemInto` will do on release:
//   • "before" — sits just above the target, at the target's depth.
//   • "after"  — sits below the target *and its whole visible subtree*, as the
//     target's sibling (target depth).
//   • "into"   — same slot as "after" but indented a level: it appends as the
//     target's last child, after any children it already shows.
// Returns null when there's no target or it isn't visible.
export function ghostPlacement(
  rows: readonly DisplayRow[],
  target: DropTarget | null,
): GhostPlacement | null {
  if (!target) return null;
  const ti = rows.findIndex((r) => r.item.id === target.id);
  if (ti === -1) return null;
  const targetDepth = rows[ti]!.depth;
  if (target.mode === "before") return { index: ti, depth: targetDepth };
  // Walk past the target's visible descendants (deeper rows) to its subtree end.
  let end = ti;
  while (end + 1 < rows.length && rows[end + 1]!.depth > targetDepth) end++;
  return {
    index: end + 1,
    depth: target.mode === "into" ? targetDepth + 1 : targetDepth,
  };
}
