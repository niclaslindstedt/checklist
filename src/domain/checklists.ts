// Pure operations over Checklists. Like templates.ts, callers supply ids and
// timestamps so every function is deterministic and DOM-free.

import type { Checklist, ChecklistItem, Template } from "./types.ts";

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
