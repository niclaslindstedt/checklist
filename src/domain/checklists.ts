// Pure operations over Checklists. Like templates.ts, callers supply ids and
// timestamps so every function is deterministic and DOM-free.

import type { Checklist, ChecklistItem, Snapshot, Template } from "./types.ts";

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
 */
export function addItem(
  checklist: Checklist,
  item: { id: string; title: string },
  now: string,
  position: "top" | "bottom" = "bottom",
): Checklist {
  const next: ChecklistItem = {
    id: item.id,
    title: item.title.trim(),
    checked: false,
  };
  return {
    ...checklist,
    items:
      position === "top"
        ? [next, ...checklist.items]
        : [...checklist.items, next],
    updatedAt: now,
  };
}

/**
 * Append several items at once, preserving each one's checked state (and
 * any `required` flag / `notes`) rather than forcing them unchecked the way
 * `addItem` does. Backs the "paste a markdown checklist" import: the parsed
 * items land at the bottom of the list, so an existing list is added to, not
 * replaced. A no-op (empty `items`) returns the same checklist untouched.
 */
export function addItems(
  checklist: Checklist,
  items: readonly ChecklistItem[],
  now: string,
): Checklist {
  if (items.length === 0) return checklist;
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
  let changed = false;
  const items = checklist.items.map((it) => {
    if (it.id !== itemId) return it;
    const next: ChecklistItem = { ...it };
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
    return next;
  });
  if (!changed) return checklist;
  return { ...checklist, items, updatedAt: now };
}

/** Permanently remove an item from the list. */
export function deleteItem(
  checklist: Checklist,
  itemId: string,
  now: string,
): Checklist {
  return {
    ...checklist,
    items: checklist.items.filter((it) => it.id !== itemId),
    updatedAt: now,
  };
}

/**
 * Archive every finished (checked) item still in the active list in one
 * sweep — the bulk counterpart to `setArchived`. Archived items are left
 * untouched (they're already out of the active list). A no-op (nothing
 * checked and active) returns the same checklist, so it never writes.
 */
export function archiveChecked(checklist: Checklist, now: string): Checklist {
  if (!checklist.items.some((it) => it.checked && !it.archived)) {
    return checklist;
  }
  return {
    ...checklist,
    items: checklist.items.map((it) =>
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
  if (!checklist.items.some((it) => it.checked && !it.archived)) {
    return checklist;
  }
  return {
    ...checklist,
    items: checklist.items.filter((it) => !(it.checked && !it.archived)),
    updatedAt: now,
  };
}

/** Mark an item archived (hidden) or active again, without destroying it. */
export function setArchived(
  checklist: Checklist,
  itemId: string,
  archived: boolean,
  now: string,
): Checklist {
  return {
    ...checklist,
    items: checklist.items.map((it) =>
      it.id === itemId ? { ...it, archived } : it,
    ),
    updatedAt: now,
  };
}

/** The items shown in the active view — everything not archived. */
export function activeItems(checklist: Checklist): ChecklistItem[] {
  return checklist.items.filter((it) => !it.archived);
}

/** The items shown in the archive view — everything marked archived. */
export function archivedItems(checklist: Checklist): ChecklistItem[] {
  return checklist.items.filter((it) => it.archived);
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
 * Archived items across every checklist, grouped by their source list and
 * kept in document order. Lists with nothing archived are dropped, so the
 * archive view renders a header only for the lists that actually contributed
 * an item.
 */
export function archivedByChecklist(snapshot: Snapshot): ArchivedGroup[] {
  return snapshot.checklists
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
  return {
    ...checklist,
    items: checklist.items.map((it) => {
      if (it.id !== itemId) return it;
      // Checking stamps `checkedAt` (the recency key the "sort checked to the
      // bottom" view sorts on); unchecking drops it so it never lingers on an
      // active item.
      if (it.checked) {
        const next: ChecklistItem = { ...it, checked: false };
        delete next.checkedAt;
        return next;
      }
      return { ...it, checked: true, checkedAt: now };
    }),
    updatedAt: now,
  };
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
  const unchecked = items.filter((it) => !it.checked);
  const checked = items.filter((it) => it.checked);
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
  return checklist.items.filter((it) => it.required).every((it) => it.checked);
}

/** Checked / total counts over the active (non-archived) items. */
export function progress(checklist: Checklist): {
  checked: number;
  total: number;
} {
  const visible = activeItems(checklist);
  return {
    checked: visible.filter((it) => it.checked).length,
    total: visible.length,
  };
}
