// Move, reorder, and display transforms over a checklist's item tree:
// drag-to-reorder among the active items, drag-to-nest relative to another
// item, the "sort checked to the bottom" view order, and the flattened,
// depth-tagged rows the list renders. Several of these are pure view
// transforms that never touch the stored document order. They compose over the
// tree primitives in `item-tree.ts` and the `activeItems` view from
// `archive-ops.ts`. Callers supply timestamps so every function is
// deterministic and DOM-free.

import { activeItems } from "./archive-ops.ts";
import {
  findItem,
  flattenItems,
  removeItem,
  withChildren,
} from "./item-tree.ts";
import type { Checklist, ChecklistItem } from "./types.ts";

/**
 * Move the active item `itemId` so it sits at `toIndex` among the active
 * (non-archived) items. Archived items are hidden from the view, so they
 * stay pinned to their original absolute slots while the visible items
 * shuffle around them. `toIndex` is clamped; a no-op move returns the same
 * checklist untouched (no `updatedAt` bump, so it never writes).
 */
export function moveItem(
  checklist: Checklist,
  itemId: string,
  toIndex: number,
  now: string,
): Checklist {
  const active = checklist.items.filter((it) => !it.archived);
  const from = active.findIndex((it) => it.id === itemId);
  if (from === -1) return checklist;

  const to = Math.max(0, Math.min(toIndex, active.length - 1));
  if (from === to) return checklist;

  const reordered = [...active];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved!);

  // Walk the full list, emitting archived items where they sat and filling
  // each active slot with the next item from the reordered sequence.
  let a = 0;
  const items = checklist.items.map((it) =>
    it.archived ? it : reordered[a++]!,
  );

  return { ...checklist, items, updatedAt: now };
}

/** Where a dropped item lands relative to the item it was dropped on. */
export type DropMode = "before" | "after" | "into";

/**
 * Move `draggedId` (with its subtree) so it lands relative to `targetId`:
 * `"into"` appends it as the target's last child, `"before"` / `"after"`
 * place it as the target's sibling on that side. Dropping an item onto
 * itself, or onto one of its own descendants, is a no-op (it would orphan
 * the subtree) and returns the same checklist untouched — as does an
 * unknown id.
 */
export function moveItemInto(
  checklist: Checklist,
  draggedId: string,
  targetId: string,
  mode: DropMode,
  now: string,
): Checklist {
  if (draggedId === targetId) return checklist;
  const dragged = findItem(checklist.items, draggedId);
  if (!dragged) return checklist;
  // The target must exist and must not live inside the dragged subtree.
  if (!findItem(checklist.items, targetId)) return checklist;
  if (findItem(dragged.children ?? [], targetId)) return checklist;

  const without = removeItem(checklist.items, draggedId);
  const inserted = insertRelative(without, dragged, targetId, mode);
  if (!inserted) return checklist;
  // Dropping before the item that already follows (or after the one that
  // already precedes) leaves the arrangement untouched — return the original
  // so it never bumps `updatedAt` or records an empty undo step.
  if (structureKey(inserted) === structureKey(checklist.items))
    return checklist;
  return { ...checklist, items: inserted, updatedAt: now };
}

/** A compact id + nesting signature, for detecting a positional no-op move. */
function structureKey(items: readonly ChecklistItem[]): string {
  return items
    .map((it) =>
      it.children && it.children.length > 0
        ? `${it.id}(${structureKey(it.children)})`
        : it.id,
    )
    .join(",");
}

/**
 * Insert `node` relative to `targetId` in the tree. `"into"` appends it to
 * the target's children; `"before"` / `"after"` splice it in as a sibling.
 * Returns null when the target isn't found (so a caller can bail).
 */
function insertRelative(
  items: ChecklistItem[],
  node: ChecklistItem,
  targetId: string,
  mode: DropMode,
): ChecklistItem[] | null {
  if (mode !== "into") {
    const idx = items.findIndex((it) => it.id === targetId);
    if (idx !== -1) {
      const next = [...items];
      next.splice(mode === "before" ? idx : idx + 1, 0, node);
      return next;
    }
  }

  let done = false;
  const next = items.map((it) => {
    if (done) return it;
    if (mode === "into" && it.id === targetId) {
      done = true;
      return withChildren(it, [...(it.children ?? []), node]);
    }
    if (it.children) {
      const kids = insertRelative(it.children, node, targetId, mode);
      if (kids) {
        done = true;
        return withChildren(it, kids);
      }
    }
    return it;
  });
  return done ? next : null;
}

/**
 * Reorder a list of items so the checked ones sink below the unchecked ones,
 * with the most recently checked item heading the checked group (by
 * `checkedAt`, descending; items missing a timestamp sink last). The
 * unchecked items keep their original relative order. A pure view transform —
 * it never touches the stored document order, so unchecking an item drops it
 * straight back where it sat.
 */
export function sortCheckedToBottom(
  items: readonly ChecklistItem[],
): ChecklistItem[] {
  // Sort each sub-list the same way before sorting this level, so the
  // checked-to-the-bottom order applies within every nested checklist too.
  const sorted = items.map((it) =>
    it.children ? withChildren(it, sortCheckedToBottom(it.children)) : it,
  );
  const unchecked = sorted.filter((it) => !it.checked);
  const checked = sorted.filter((it) => it.checked);
  // Array.prototype.sort is stable, so ties (and missing timestamps) preserve
  // document order within the checked group.
  checked.sort((a, b) => (b.checkedAt ?? "").localeCompare(a.checkedAt ?? ""));
  return [...unchecked, ...checked];
}

/**
 * Float the unchecked items that carry a `deadline` to the bottom of the
 * unchecked group, sorted by due date (soonest — and overdue — first), so
 * every dated task clusters together just above the checked items with its
 * date row on show. Undated unchecked items and checked items keep their
 * incoming relative order; the dated ones slot in right after the last
 * unchecked item. Recurses into each sub-list so nested dated items float the
 * same way. A pure view transform — it never touches the stored document
 * order — and leaves an undated level's order untouched.
 */
export function floatDatedToBottom(
  items: readonly ChecklistItem[],
): ChecklistItem[] {
  const mapped = items.map((it) =>
    it.children ? withChildren(it, floatDatedToBottom(it.children)) : it,
  );
  const isDated = (it: ChecklistItem) => !it.checked && Boolean(it.deadline);
  if (!mapped.some(isDated)) return mapped;
  const dated = mapped
    .filter(isDated)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  const rest = mapped.filter((it) => !isDated(it));
  // Insert the dated cluster right after the last unchecked item — the bottom
  // of the unchecked group — so it sits above any checked rows.
  let insertAt = 0;
  rest.forEach((it, i) => {
    if (!it.checked) insertAt = i + 1;
  });
  return [...rest.slice(0, insertAt), ...dated, ...rest.slice(insertAt)];
}

/**
 * The active items in the order the checklist view renders them: plain
 * document order (or, when `sinkChecked` is on, with the checked items sorted
 * to the bottom — see `sortCheckedToBottom`), then with any dated unchecked
 * items floated to the bottom of the unchecked group (see
 * `floatDatedToBottom`). The dated float always applies; the checked sink is
 * opt-in.
 */
export function displayItems(
  checklist: Checklist,
  sinkChecked: boolean,
): ChecklistItem[] {
  const active = activeItems(checklist);
  const sunk = sinkChecked ? sortCheckedToBottom(active) : active;
  return floatDatedToBottom(sunk);
}

/**
 * Move a visible item to `toIndex` expressed against the *displayed* order.
 * With `sinkChecked` off this is just `moveItem`. With it on, the displayed
 * order is a permutation of the document order, so the drop index is
 * translated through the item currently sitting at that display slot (the
 * "anchor"): the dragged item takes that anchor's place in the document, and
 * the view re-derives its sorted order from there. Keeps drag-to-reorder
 * working without ever persisting the sunk-to-bottom ordering.
 */
export function moveDisplayedItem(
  checklist: Checklist,
  itemId: string,
  toIndex: number,
  sinkChecked: boolean,
  now: string,
): Checklist {
  if (!sinkChecked) return moveItem(checklist, itemId, toIndex, now);
  const display = displayItems(checklist, true);
  if (display.length === 0) return checklist;
  const active = activeItems(checklist);
  const clamped = Math.max(0, Math.min(toIndex, display.length - 1));
  const anchorId = display[clamped]!.id;
  const docIndex = active.findIndex((it) => it.id === anchorId);
  if (docIndex === -1) return checklist;
  return moveItem(checklist, itemId, docIndex, now);
}

/** True when every required item is checked (or there are no required ones). */
export function isComplete(checklist: Checklist): boolean {
  return flattenItems(checklist.items)
    .filter((it) => it.required)
    .every((it) => it.checked);
}

/**
 * Checked / total counts over the active (non-archived) items, sub-items
 * included — every visible checkable line counts toward the header's tally.
 */
export function progress(checklist: Checklist): {
  checked: number;
  total: number;
} {
  const visible = flattenItems(activeItems(checklist));
  return {
    checked: visible.filter((it) => it.checked).length,
    total: visible.length,
  };
}

/** One row in the flattened, depth-tagged view the checklist list renders. */
export interface DisplayRow {
  item: ChecklistItem;
  /** Nesting depth — 0 for a top-level item, 1 for its child, and so on. */
  depth: number;
  /** Whether the item has any sub-items (so the row shows an expand toggle). */
  hasChildren: boolean;
}

/**
 * Flatten a visible item tree into the ordered rows the list renders, tagging
 * each with its nesting `depth`. A collapsed item (its id in `collapsed`)
 * still appears, but its children are skipped — the expand toggle reveals
 * them, mirroring how a note body is revealed. Pure, so the view can derive
 * its row list without a DOM.
 */
export function flattenForDisplay(
  items: readonly ChecklistItem[],
  collapsed: ReadonlySet<string>,
): DisplayRow[] {
  const out: DisplayRow[] = [];
  const walk = (list: readonly ChecklistItem[], depth: number) => {
    for (const it of list) {
      const children = it.children ?? [];
      out.push({ item: it, depth, hasChildren: children.length > 0 });
      if (children.length > 0 && !collapsed.has(it.id)) {
        walk(children, depth + 1);
      }
    }
  };
  walk(items, 0);
  return out;
}
