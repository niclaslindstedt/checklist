// Item operations over a checklist's tree: adding items (at the top, bottom,
// nested under a parent, or after a sibling), editing text and notes, deleting,
// toggling checked state, and the bulk check/uncheck sweep. These compose over
// the tree primitives in `item-tree.ts` and recurse through the tree so a
// sub-list behaves like a miniature checklist. Like the rest of the domain
// layer, callers supply ids and timestamps so every function is deterministic
// and DOM-free.

import { activeItems } from "./archive-ops.ts";
import {
  findItem,
  flattenItems,
  removeItem,
  updateItem,
  withChildren,
} from "./item-tree.ts";
import type { Checklist, ChecklistItem } from "./types.ts";

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
