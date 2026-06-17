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
    items: checklist.items.map((it) =>
      it.id === itemId ? { ...it, checked: !it.checked } : it,
    ),
    updatedAt: now,
  };
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
