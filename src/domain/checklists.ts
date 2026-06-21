// Pure operations over Checklists. Like templates.ts, callers supply ids and
// timestamps so every function is deterministic and DOM-free.
//
// Items form a tree: each `ChecklistItem` may carry `children`, built up by
// dropping one item onto another while dragging (see `moveItemInto`). The
// helpers in the first block below walk that tree; the operations underneath
// (toggle, edit, delete, archive, sort) recurse through it so a sub-list
// behaves like a miniature checklist of its own.

import type { Checklist, ChecklistItem, Snapshot, Template } from "./types.ts";

// ── Tree helpers ───────────────────────────────────────────────────────────

/**
 * Attach `children` to an item, dropping the key entirely when the list is
 * empty so a leaf stays `{ ...item }` (no `children: []`) and round-trips
 * byte-for-byte. Returns the original item untouched when nothing changes.
 */
function withChildren(
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
function updateItem(
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
function removeItem(items: ChecklistItem[], id: string): ChecklistItem[] {
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
function mapTree(
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

/** Stamp out an independent, checkable instance from a template. */
export function instantiate(
  template: Template,
  id: string,
  now: string,
): Checklist {
  return {
    version: 1,
    id,
    templateId: template.id,
    name: template.name,
    items: template.items.map((it) => ({ ...it, checked: false })),
    createdAt: now,
    updatedAt: now,
  };
}

/** Start an empty, free-standing checklist not tied to any template. */
export function createChecklist(
  id: string,
  name: string,
  now: string,
): Checklist {
  return {
    version: 1,
    id,
    templateId: "",
    name: name.trim(),
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Rename a checklist, trimming the new name and bumping `updatedAt`. */
export function renameChecklist(
  checklist: Checklist,
  name: string,
  now: string,
): Checklist {
  return { ...checklist, name: name.trim(), updatedAt: now };
}

/**
 * Archive (hide) or restore a whole checklist without destroying it — the
 * list-level counterpart of `setArchived` for an item. An archived list
 * drops out of the switcher and the checklist view and surfaces in the
 * archive view's "Archived lists" section instead. A no-op (already in the
 * requested state) returns the same checklist untouched so it never writes.
 */
export function setChecklistArchived(
  checklist: Checklist,
  archived: boolean,
  now: string,
): Checklist {
  if (archived) {
    if (checklist.archived) return checklist;
    return { ...checklist, archived: true, updatedAt: now };
  }
  if (!checklist.archived) return checklist;
  const next = { ...checklist, updatedAt: now };
  delete next.archived;
  return next;
}

/** The active (non-archived) checklists, in document order. */
export function activeChecklists(snapshot: Snapshot): Checklist[] {
  return snapshot.checklists.filter((c) => !c.archived);
}

/** The archived checklists, in document order. */
export function archivedChecklists(snapshot: Snapshot): Checklist[] {
  return snapshot.checklists.filter((c) => c.archived);
}

/**
 * The next free default name for a new checklist: `base` if no existing
 * list already carries it, otherwise `base 2`, `base 3`, … — the lowest
 * unused suffix. Lets "add checklist" mint "Checklist", then "Checklist 2",
 * and so on without ever colliding with a list the user already has.
 */
export function nextChecklistName(
  existing: readonly { name: string }[],
  base: string,
): string {
  const names = new Set(existing.map((c) => c.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

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
 * Archive every finished (checked) item still in the active list in one
 * sweep — the bulk counterpart to `setArchived`. Archived items are left
 * untouched (they're already out of the active list). A no-op (nothing
 * checked and active) returns the same checklist, so it never writes.
 */
export function archiveChecked(checklist: Checklist, now: string): Checklist {
  if (!flattenItems(checklist.items).some((it) => it.checked && !it.archived)) {
    return checklist;
  }
  return {
    ...checklist,
    items: mapTree(checklist.items, (it) =>
      it.checked && !it.archived ? { ...it, archived: true } : it,
    ),
    updatedAt: now,
  };
}

/**
 * Permanently remove every finished (checked) item from the active list in
 * one sweep — the bulk counterpart to `deleteItem`. Archived items are kept
 * (they've left the active list already). A no-op returns the same
 * checklist untouched.
 */
export function deleteChecked(checklist: Checklist, now: string): Checklist {
  if (!flattenItems(checklist.items).some((it) => it.checked && !it.archived)) {
    return checklist;
  }
  // Drop every finished node and its subtree, recursing into the survivors so
  // a finished item nested under an unchecked parent is swept too.
  const prune = (list: readonly ChecklistItem[]): ChecklistItem[] => {
    const out: ChecklistItem[] = [];
    for (const it of list) {
      if (it.checked && !it.archived) continue;
      out.push(it.children ? withChildren(it, prune(it.children)) : it);
    }
    return out;
  };
  return { ...checklist, items: prune(checklist.items), updatedAt: now };
}

/**
 * Mark an item archived (hidden) or active again, without destroying it. The
 * flag rides one node only — its subtree travels with it, hidden along with
 * its archived parent and restored when the parent is.
 */
export function setArchived(
  checklist: Checklist,
  itemId: string,
  archived: boolean,
  now: string,
): Checklist {
  const items = updateItem(checklist.items, itemId, (it) => {
    if (archived) {
      if (it.archived) return it;
      return { ...it, archived: true };
    }
    if (!it.archived) return it;
    const next = { ...it };
    delete next.archived;
    return next;
  });
  if (items === checklist.items) return checklist;
  return { ...checklist, items, updatedAt: now };
}

/**
 * The visible tree — top-level items that aren't archived, each with its own
 * archived descendants pruned away. Children of an archived item are hidden
 * along with it; an item archived on its own drops out wherever it sits.
 */
export function activeItems(checklist: Checklist): ChecklistItem[] {
  const prune = (list: readonly ChecklistItem[]): ChecklistItem[] => {
    const out: ChecklistItem[] = [];
    for (const it of list) {
      if (it.archived) continue;
      out.push(it.children ? withChildren(it, prune(it.children)) : it);
    }
    return out;
  };
  return prune(checklist.items);
}

/**
 * The archived items shown in the archive view: the roots of each archived
 * subtree (an archived item whose ancestors are all active). Its descendants
 * travel with it rather than being listed separately, so restoring or
 * deleting one entry acts on the whole group.
 */
export function archivedItems(checklist: Checklist): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  const walk = (list: readonly ChecklistItem[]) => {
    for (const it of list) {
      if (it.archived) out.push(it);
      else if (it.children) walk(it.children);
    }
  };
  walk(checklist.items);
  return out;
}

/** A checklist's archived items, kept with its source list's identity. */
export interface ArchivedGroup {
  /** The source checklist's id. */
  id: string;
  /** The source checklist's name, shown as the archive view's header. */
  name: string;
  /** That checklist's archived items, in document order. */
  items: ChecklistItem[];
}

/**
 * Archived items across every active checklist, grouped by their source
 * list and kept in document order. Lists with nothing archived are dropped,
 * so the archive view renders a header only for the lists that actually
 * contributed an item. A wholly-archived list is excluded — it surfaces as
 * a unit in the archive's "Archived lists" section instead (see
 * `archivedChecklists`), so its items don't also appear here.
 */
export function archivedByChecklist(snapshot: Snapshot): ArchivedGroup[] {
  return snapshot.checklists
    .filter((c) => !c.archived)
    .map((c) => ({ id: c.id, name: c.name, items: archivedItems(c) }))
    .filter((g) => g.items.length > 0);
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
