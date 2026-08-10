// Move, reorder, and display transforms over a checklist's item tree:
// drag-to-reorder among the active items, drag-to-nest relative to another
// item, the three opt-in view sorts (checked to the bottom, dated to the top,
// held-back to the bottom), and the flattened, depth-tagged rows the list
// renders. Several of these are pure view
// transforms that never touch the stored document order. They compose over the
// tree primitives in `item-tree.ts` and the `activeItems` view from
// `archive-ops.ts`. Callers supply timestamps so every function is
// deterministic and DOM-free.

import { activeItems } from "./archive-ops.ts";
import { isHeldBack } from "./deadlines.ts";
import {
  findItem,
  flattenItems,
  removeItem,
  withChildren,
  withItems,
} from "./item-tree.ts";
import type { ChecklistItem, ItemList } from "./types.ts";

/**
 * Move the active item `itemId` so it sits at `toIndex` among the active
 * (non-archived) items. Archived items are hidden from the view, so they
 * stay pinned to their original absolute slots while the visible items
 * shuffle around them. `toIndex` is clamped; a no-op move returns the same
 * checklist untouched (no `updatedAt` bump, so it never writes).
 */
export function moveItem<L extends ItemList>(
  checklist: L,
  itemId: string,
  toIndex: number,
  now: string,
): L {
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

  return withItems(checklist, items, now);
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
export function moveItemInto<L extends ItemList>(
  checklist: L,
  draggedId: string,
  targetId: string,
  mode: DropMode,
  now: string,
): L {
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
  return withItems(checklist, inserted, now);
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
 * Float the unchecked items that carry a `deadline` to the **top** of the
 * level, soonest (and overdue) first, so what's on a clock leads the list and
 * its dates read down the screen in the order they fall due. Undated items and
 * checked items keep their incoming relative order beneath the dated cluster.
 * Recurses into each sub-list so nested dated items float the same way. A pure
 * view transform — it never touches the stored document order — and leaves an
 * undated level's order untouched.
 */
export function floatDatedToTop(
  items: readonly ChecklistItem[],
): ChecklistItem[] {
  const mapped = items.map((it) =>
    it.children ? withChildren(it, floatDatedToTop(it.children)) : it,
  );
  const isDated = (it: ChecklistItem) => !it.checked && Boolean(it.deadline);
  if (!mapped.some(isDated)) return mapped;
  // Array.prototype.sort is stable, so items sharing a due date keep their
  // incoming order — which is what lets the view group a run of them under one
  // date instead of repeating it per row.
  const dated = mapped
    .filter(isDated)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  return [...dated, ...mapped.filter((it) => !isDated(it))];
}

/**
 * Sink the unchecked items that are **held back** — gated by a `notBefore` day
 * that hasn't arrived (see `isHeldBack`) — to the bottom of the unchecked
 * group, soonest gate first, so work that can't be started yet sits out of the
 * way but still above the finished items. An item whose gate has already
 * passed is an ordinary item and doesn't move.
 *
 * Everything else keeps its incoming relative order, and the held cluster
 * slots in right after the last unchecked item so it never falls below a
 * checked row. Recurses into each sub-list. `now` is a full ISO timestamp —
 * held-ness is relative to today, so unlike the other view transforms this one
 * needs the clock passed in rather than reading it.
 */
export function sinkHeldToBottom(
  items: readonly ChecklistItem[],
  now: string,
): ChecklistItem[] {
  const mapped = items.map((it) =>
    it.children ? withChildren(it, sinkHeldToBottom(it.children, now)) : it,
  );
  const isHeld = (it: ChecklistItem) => !it.checked && isHeldBack(it, now);
  if (!mapped.some(isHeld)) return mapped;
  // Stable, like the dated float above — a run sharing one gate day stays in
  // its incoming order so the view can show that day once for the whole run.
  const held = mapped
    .filter(isHeld)
    .sort((a, b) => a.notBefore!.localeCompare(b.notBefore!));
  const rest = mapped.filter((it) => !isHeld(it));
  // Insert the held cluster right after the last unchecked item — the bottom
  // of the unchecked group — so it sits above any checked rows.
  let insertAt = 0;
  rest.forEach((it, i) => {
    if (!it.checked) insertAt = i + 1;
  });
  return [...rest.slice(0, insertAt), ...held, ...rest.slice(insertAt)];
}

/**
 * How the checklist view orders the items it renders. Every field is a user
 * preference (Settings → Lists); all three are pure view transforms that never
 * touch the stored document order, so switching one off drops each item
 * straight back where it sat.
 */
export interface DisplayOrder {
  /** Sort checked items below the unchecked ones (`sortCheckedToBottom`). */
  sinkChecked: boolean;
  /** Float items with a due date to the top, soonest first (`floatDatedToTop`). */
  datedFirst: boolean;
  /** Sink held-back items to the bottom of the unchecked group (`sinkHeldToBottom`). */
  heldLast: boolean;
}

/** Nothing reordered — plain document order. The base for tests and callers
 * that render a list exactly as stored. */
export const DOCUMENT_ORDER: DisplayOrder = {
  sinkChecked: false,
  datedFirst: false,
  heldLast: false,
};

/**
 * The active items in the order the checklist view renders them, applying each
 * enabled transform in turn: the checked sink first, then the dated float to
 * the top, then the held-back sink to the bottom.
 *
 * The order of those last two is what settles an item that is *both* dated and
 * held back: the sink runs last, so it wins. That's the right call — a due date
 * says when work must be finished, but a gate says it can't be started at all,
 * and there is nothing to do at the top of the list about a task you can't
 * touch yet.
 */
export function displayItems(
  checklist: ItemList,
  order: DisplayOrder,
  now: string,
): ChecklistItem[] {
  const active = activeItems(checklist);
  const sunk = order.sinkChecked ? sortCheckedToBottom(active) : active;
  const dated = order.datedFirst ? floatDatedToTop(sunk) : sunk;
  return order.heldLast ? sinkHeldToBottom(dated, now) : dated;
}

/**
 * Move a visible item to `toIndex` expressed against the *displayed* order.
 * When nothing is reordering the level, that index is the document index and
 * this is just `moveItem`. Otherwise the displayed order is a permutation of
 * the document order, so the drop index is translated through the item
 * currently sitting at that display slot (the "anchor"): the dragged item takes
 * that anchor's place in the document, and the view re-derives its sorted order
 * from there. Keeps drag-to-reorder working without ever persisting a sorted
 * ordering.
 */
export function moveDisplayedItem<L extends ItemList>(
  checklist: L,
  itemId: string,
  toIndex: number,
  order: DisplayOrder,
  now: string,
): L {
  const active = activeItems(checklist);
  const display = displayItems(checklist, order, now);
  if (display.length === 0) return checklist;
  // Every transform is off, or none of them moved anything on this list —
  // the display index *is* the document index, so drop straight through.
  if (display.every((it, i) => it.id === active[i]?.id)) {
    return moveItem(checklist, itemId, toIndex, now);
  }
  const clamped = Math.max(0, Math.min(toIndex, display.length - 1));
  const anchorId = display[clamped]!.id;
  const docIndex = active.findIndex((it) => it.id === anchorId);
  if (docIndex === -1) return checklist;
  return moveItem(checklist, itemId, docIndex, now);
}

/** True when every required item is checked (or there are no required ones). */
export function isComplete(checklist: ItemList): boolean {
  return flattenItems(checklist.items)
    .filter((it) => it.required)
    .every((it) => it.checked);
}

/**
 * Checked / total counts over the active (non-archived) items, sub-items
 * included — every visible checkable line counts toward the tally. Category
 * headers count only when `countCategories` says so (see `countableItems`);
 * the default keeps them in for callers that report what a list *contains*
 * rather than how far through it the user is.
 */
export function progress(
  checklist: ItemList,
  countCategories = true,
): {
  checked: number;
  total: number;
} {
  const visible = countableItems(activeItems(checklist), countCategories);
  return {
    checked: visible.filter((it) => it.checked).length,
    total: visible.length,
  };
}

/**
 * The lines of a visible item tree that count toward a progress tally,
 * flattened depth-first — every sub-item counts, exactly as it renders.
 *
 * A **category** header is a grouping label rather than a line of work, so by
 * default it is left out: a list of six groceries under two headers reads as
 * `0/6`, not `0/8`, and ticking every grocery finishes the list even though
 * the two headers sit there unchecked. `countCategories` (the "Count
 * categories" preference) opts the headers back in for a user who does treat
 * them as items.
 */
export function countableItems(
  items: readonly ChecklistItem[],
  countCategories: boolean,
): ChecklistItem[] {
  const flat = flattenItems(items);
  return countCategories ? flat : flat.filter((it) => !it.category);
}

/** One row in the flattened, depth-tagged view the checklist list renders. */
export interface DisplayRow {
  item: ChecklistItem;
  /** Nesting depth — 0 for a top-level item, 1 for its child, and so on. */
  depth: number;
  /** Whether the item has any sub-items (so the row shows an expand toggle). */
  hasChildren: boolean;
  /**
   * The row directly above already shows this item's `notBefore` day, at the
   * same depth — so this row leaves the date off and reads as a continuation
   * of the run above it. The sort clusters items sharing a gate day together
   * (see `sinkHeldToBottom`), which would otherwise stack the identical date
   * down the screen once per row; the inert checkbox carries the "not yet"
   * signal on every row regardless, so the date is only worth stating once.
   *
   * Optional so a hand-built row (a drag ghost, a test fixture) needn't carry
   * it — absent reads the same as false: state the date.
   */
  sameGateAsPrevious?: boolean;
}

/**
 * Flatten a visible item tree into the ordered rows the list renders, tagging
 * each with its nesting `depth`. A collapsed item (its id in `collapsed`)
 * still appears, but its children are skipped — the expand toggle reveals
 * them, mirroring how a note body is revealed. Pure, so the view can derive
 * its row list without a DOM.
 *
 * Each row is also tagged with `sameGateAsPrevious` so a run of items sharing
 * one "not before" day states it once. That's a purely structural comparison
 * against the row above (same day, same depth) and needs no clock: two items
 * carrying the same gate day are always held, or released, together.
 */
export function flattenForDisplay(
  items: readonly ChecklistItem[],
  collapsed: ReadonlySet<string>,
): DisplayRow[] {
  const out: DisplayRow[] = [];
  const walk = (list: readonly ChecklistItem[], depth: number) => {
    for (const it of list) {
      const children = it.children ?? [];
      const prev = out[out.length - 1];
      const row: DisplayRow = {
        item: it,
        depth,
        hasChildren: children.length > 0,
      };
      if (
        it.notBefore !== undefined &&
        prev?.depth === depth &&
        prev.item.notBefore === it.notBefore
      ) {
        row.sameGateAsPrevious = true;
      }
      out.push(row);
      if (children.length > 0 && !collapsed.has(it.id)) {
        walk(children, depth + 1);
      }
    }
  };
  walk(items, 0);
  return out;
}
