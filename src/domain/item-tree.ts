// Pure primitives for walking and rewriting a checklist's item tree. Every
// checklist item may carry `children` (built up by dropping one item onto
// another while dragging — see `moveItemInto`), so the operations that toggle,
// edit, delete, archive, and sort items recurse through this shape. These
// helpers are the shared building blocks the rest of the domain layer composes
// over; they take ids and return new arrays (or the same reference on a no-op),
// so callers can detect an unchanged tree and skip the write.

import type { ChecklistItem } from "./types.ts";

/**
 * Attach `children` to an item, dropping the key entirely when the list is
 * empty so a leaf stays `{ ...item }` (no `children: []`) and round-trips
 * byte-for-byte. Returns the original item untouched when nothing changes.
 */
export function withChildren(
  item: ChecklistItem,
  children: ChecklistItem[],
): ChecklistItem {
  if (children.length > 0) {
    if (item.children === children) return item;
    return { ...item, children };
  }
  if (item.children === undefined) return item;
  const next = { ...item };
  delete next.children;
  return next;
}

/** Every item in the tree, depth-first, parents before their children. */
export function flattenItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const walk = (list: readonly ChecklistItem[]) => {
    for (const it of list) {
      out.push(it);
      if (it.children) walk(it.children);
    }
  };
  walk(items);
  return out;
}

/** Find an item by id anywhere in the tree, or undefined. */
export function findItem(
  items: readonly ChecklistItem[],
  id: string,
): ChecklistItem | undefined {
  for (const it of items) {
    if (it.id === id) return it;
    if (it.children) {
      const found = findItem(it.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Apply `updater` to the item with `id` wherever it sits in the tree. The
 * updater returns a replacement node (or the same reference for a no-op).
 * Returns the same array reference when nothing changed, so callers can
 * detect a no-op and skip the write.
 */
export function updateItem(
  items: ChecklistItem[],
  id: string,
  updater: (item: ChecklistItem) => ChecklistItem,
): ChecklistItem[] {
  let changed = false;
  const next = items.map((it) => {
    if (it.id === id) {
      const replaced = updater(it);
      if (replaced !== it) changed = true;
      return replaced;
    }
    if (it.children) {
      const kids = updateItem(it.children, id, updater);
      if (kids !== it.children) {
        changed = true;
        return { ...it, children: kids };
      }
    }
    return it;
  });
  return changed ? next : items;
}

/**
 * Drop the item with `id` (and its whole subtree) from the tree. Returns the
 * same array reference when the id isn't present.
 */
export function removeItem(
  items: ChecklistItem[],
  id: string,
): ChecklistItem[] {
  let changed = false;
  const next: ChecklistItem[] = [];
  for (const it of items) {
    if (it.id === id) {
      changed = true;
      continue;
    }
    if (it.children) {
      const kids = removeItem(it.children, id);
      if (kids !== it.children) {
        changed = true;
        next.push(withChildren(it, kids));
        continue;
      }
    }
    next.push(it);
  }
  return changed ? next : items;
}

/** Replace `children` recursively with the result of `fn`, building new nodes. */
export function mapTree(
  items: readonly ChecklistItem[],
  fn: (item: ChecklistItem) => ChecklistItem,
): ChecklistItem[] {
  return items.map((it) => {
    const mapped = fn(it);
    if (mapped.children) {
      return withChildren(mapped, mapTree(mapped.children, fn));
    }
    return mapped;
  });
}
