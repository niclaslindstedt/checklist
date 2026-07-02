// Pure operations over Checklists. Like templates.ts, callers supply ids and
// timestamps so every function is deterministic and DOM-free.
//
// Items form a tree: each `ChecklistItem` may carry `children`, built up by
// dropping one item onto another while dragging (see `moveItemInto`). The
// tree primitives that walk and rewrite that shape live in `item-tree.ts`;
// the operations here (toggle, edit, delete, archive, sort) compose over them
// so a sub-list behaves like a miniature checklist of its own.

import { activeItems } from "./archive-ops.ts";
import {
  findItem,
  flattenItems,
  removeItem,
  updateItem,
  withChildren,
} from "./item-tree.ts";
import type { Checklist, ChecklistItem } from "./types.ts";

// Re-export the tree primitives that form part of this module's public API.
// The internal-only helpers (`withChildren`, `updateItem`, `removeItem`) stay
// out of the barrel — they're imported above for local use.
export { findItem, flattenItems };

// Checklist-level CRUD/metadata (create, rename, appearance, archive, and the
// active/archived snapshot queries) lives in `checklist-ops.ts` — it operates
// on whole lists and never walks the item tree. Re-exported here so the
// barrel's public API stays intact.
export {
  activeChecklists,
  archivedChecklists,
  createChecklist,
  instantiate,
  nextChecklistName,
  renameChecklist,
  setChecklistAppearance,
  setChecklistArchived,
} from "./checklist-ops.ts";

// Archive operations over the item tree (archive/restore items, sweep finished
// items, and the archived-items queries) live in `archive-ops.ts`. `activeItems`
// is imported above for local use by the item and display operations below;
// the rest are re-exported here to keep the barrel's public API intact.
export {
  archiveChecked,
  archivedByChecklist,
  archivedItems,
  deleteChecked,
  setArchived,
} from "./archive-ops.ts";
export type { ArchivedGroup } from "./archive-ops.ts";
export { activeItems };

/**
 * Add a fresh, unchecked item to the list. `position` controls where it
 * lands — appended to the bottom (the default) or prepended to the top.
 *
 * Pass `parentId` to nest the new item as a sub-item of an existing item
 * instead of dropping it at the top level — the "add sub-item" affordance
 * in the row editor uses this so a checklist can grow its tree without the
 * drag-to-nest gesture. `position` applies within the parent's children too.
 * A `parentId` that isn't in the tree falls back to a top-level add, so an
 * item is never silently lost.
 */
export function addItem(
  checklist: Checklist,
  item: { id: string; title: string },
  now: string,
  position: "top" | "bottom" = "bottom",
  parentId?: string,
): Checklist {
  const next: ChecklistItem = {
    id: item.id,
    title: item.title.trim(),
    checked: false,
  };
  const place = (list: readonly ChecklistItem[]): ChecklistItem[] =>
    position === "top" ? [next, ...list] : [...list, next];
  if (parentId) {
    const items = updateItem(checklist.items, parentId, (parent) =>
      withChildren(parent, place(parent.children ?? [])),
    );
    if (items !== checklist.items) {
      return { ...checklist, items, updatedAt: now };
    }
    // Parent gone — fall through to a top-level add rather than drop the item.
  }
  return { ...checklist, items: place(checklist.items), updatedAt: now };
}

/**
 * Append several items at once, preserving each one's checked state (and
 * any `required` flag / `notes`) rather than forcing them unchecked the way
 * `addItem` does. Backs the "paste a markdown checklist" import: the parsed
 * items land at the bottom of the list, so an existing list is added to, not
 * replaced. Pass `parentId` to append them as sub-items of an existing item
 * (the in-row sub-item composer pastes there); an unknown `parentId` falls
 * back to a top-level append. A no-op (empty `items`) returns the same
 * checklist untouched.
 */
export function addItems(
  checklist: Checklist,
  items: readonly ChecklistItem[],
  now: string,
  parentId?: string,
): Checklist {
  if (items.length === 0) return checklist;
  if (parentId) {
    const next = updateItem(checklist.items, parentId, (parent) =>
      withChildren(parent, [...(parent.children ?? []), ...items]),
    );
    if (next !== checklist.items) {
      return { ...checklist, items: next, updatedAt: now };
    }
    // Parent gone — fall through to a top-level append.
  }
  return {
    ...checklist,
    items: [...checklist.items, ...items],
    updatedAt: now,
  };
}

/**
 * Splice `nodes` into the tree immediately after the sibling `afterId`,
 * wherever it sits — at the top level or nested in some item's children — so
 * the inserted items become `afterId`'s next siblings at its own depth.
 * Returns null when `afterId` isn't in the tree, so a caller can fall back to
 * a plain append rather than dropping the items.
 */
function spliceAfter(
  items: readonly ChecklistItem[],
  nodes: readonly ChecklistItem[],
  afterId: string,
): ChecklistItem[] | null {
  const idx = items.findIndex((it) => it.id === afterId);
  if (idx !== -1) {
    const next = [...items];
    next.splice(idx + 1, 0, ...nodes);
    return next;
  }
  let done = false;
  const next = items.map((it) => {
    if (done || !it.children) return it;
    const kids = spliceAfter(it.children, nodes, afterId);
    if (kids) {
      done = true;
      return withChildren(it, kids);
    }
    return it;
  });
  return done ? next : null;
}

/**
 * Add a fresh, unchecked item immediately after the sibling `afterId` — the
 * "press an item, hit Enter, keep adding right there" flow, which drops new
 * items directly under the one being edited instead of at the top or bottom.
 * The new item lands at `afterId`'s own depth (its next sibling), nested or
 * top-level alike. An `afterId` that isn't in the tree falls back to a
 * bottom append so the item is never silently lost.
 */
export function addItemAfter(
  checklist: Checklist,
  item: { id: string; title: string },
  afterId: string,
  now: string,
): Checklist {
  const next: ChecklistItem = {
    id: item.id,
    title: item.title.trim(),
    checked: false,
  };
  const inserted = spliceAfter(checklist.items, [next], afterId);
  if (!inserted) {
    return { ...checklist, items: [...checklist.items, next], updatedAt: now };
  }
  return { ...checklist, items: inserted, updatedAt: now };
}

/**
 * Insert several items at once immediately after the sibling `afterId`,
 * preserving each one's checked state / `required` flag / `notes` the way
 * `addItems` does — the "paste a markdown checklist into the after-an-item
 * composer" path. The items keep their given order and land at `afterId`'s
 * depth. An unknown `afterId` (or an empty `items`) falls back to a bottom
 * append; an empty list returns the same checklist untouched.
 */
export function addItemsAfter(
  checklist: Checklist,
  items: readonly ChecklistItem[],
  afterId: string,
  now: string,
): Checklist {
  if (items.length === 0) return checklist;
  const inserted = spliceAfter(checklist.items, items, afterId);
  if (!inserted) {
    return {
      ...checklist,
      items: [...checklist.items, ...items],
      updatedAt: now,
    };
  }
  return { ...checklist, items: inserted, updatedAt: now };
}

/**
 * Edit an existing item's text in place — its `title` and/or its `notes`
 * body. Only the fields present in `fields` are touched, so editing the
 * title never disturbs the note and vice versa. The title is trimmed and a
 * blank title is ignored (an item always keeps a non-empty headline); the
 * notes body is trimmed too, and a now-empty body drops the `notes` key
 * entirely rather than persisting an empty string. A no-op edit (nothing
 * actually changed) returns the same checklist untouched, so it never bumps
 * `updatedAt` or triggers a write.
 */
export function editItem(
  checklist: Checklist,
  itemId: string,
  fields: { title?: string; notes?: string },
  now: string,
): Checklist {
  const items = updateItem(checklist.items, itemId, (it) => {
    const next: ChecklistItem = { ...it };
    let changed = false;
    if (fields.title !== undefined) {
      const title = fields.title.trim();
      if (title && title !== it.title) {
        next.title = title;
        changed = true;
      }
    }
    if (fields.notes !== undefined) {
      const notes = fields.notes.trim();
      if (notes) {
        if (notes !== it.notes) {
          next.notes = notes;
          changed = true;
        }
      } else if (it.notes !== undefined) {
        delete next.notes;
        changed = true;
      }
    }
    return changed ? next : it;
  });
  if (items === checklist.items) return checklist;
  return { ...checklist, items, updatedAt: now };
}

/** Permanently remove an item — and its whole subtree — from the list. */
export function deleteItem(
  checklist: Checklist,
  itemId: string,
  now: string,
): Checklist {
  const items = removeItem(checklist.items, itemId);
  if (items === checklist.items) return checklist;
  return { ...checklist, items, updatedAt: now };
}

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

export function toggleItem(
  checklist: Checklist,
  itemId: string,
  now: string,
): Checklist {
  const target = findItem(checklist.items, itemId);
  if (!target) return checklist;
  // Checking a parent cascades down its whole subtree, and unchecking clears
  // it — so a checked-off group reads as done top to bottom. Checking stamps
  // `checkedAt` (the recency key the "sort checked to the bottom" view sorts
  // on); unchecking drops it so it never lingers on an active item.
  const check = !target.checked;
  const apply = (it: ChecklistItem): ChecklistItem => {
    const next: ChecklistItem = check
      ? { ...it, checked: true, checkedAt: now }
      : { ...it, checked: false };
    if (!check) delete next.checkedAt;
    if (it.children) next.children = it.children.map(apply);
    return next;
  };
  const items = updateItem(checklist.items, itemId, apply);
  return { ...checklist, items, updatedAt: now };
}

/**
 * Check or uncheck every active (non-archived) item in one sweep — the bulk
 * action behind the header count's dropdown ("Check all" / "Uncheck all").
 * Walks the whole tree but skips archived subtrees, since archived items are
 * hidden from the count this action mirrors. Checking stamps `checkedAt` (the
 * recency key the sink-checked view sorts on); unchecking clears it. A no-op
 * (every active item already in the requested state) returns the same
 * checklist untouched, so it never bumps `updatedAt` or triggers a write.
 */
export function setAllChecked(
  checklist: Checklist,
  checked: boolean,
  now: string,
): Checklist {
  if (
    !flattenItems(activeItems(checklist)).some((it) => it.checked !== checked)
  ) {
    return checklist;
  }
  const apply = (it: ChecklistItem): ChecklistItem => {
    // Leave archived items (and their whole subtree) exactly as they are —
    // they're hidden, so a bulk check over the visible list never touches them.
    if (it.archived) return it;
    let next = it;
    if (it.checked !== checked) {
      next = checked
        ? { ...it, checked: true, checkedAt: now }
        : { ...it, checked: false };
      if (!checked) delete next.checkedAt;
    }
    if (next.children) {
      next = withChildren(next, next.children.map(apply));
    }
    return next;
  };
  return { ...checklist, items: checklist.items.map(apply), updatedAt: now };
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
 * The active items in the order the checklist view renders them: plain
 * document order, or — when `sinkChecked` is on — with the checked items
 * sorted to the bottom (see `sortCheckedToBottom`).
 */
export function displayItems(
  checklist: Checklist,
  sinkChecked: boolean,
): ChecklistItem[] {
  const active = activeItems(checklist);
  return sinkChecked ? sortCheckedToBottom(active) : active;
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
