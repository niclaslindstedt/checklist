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

/** Append a fresh, unchecked item to the end of the list. */
export function addItem(
  checklist: Checklist,
  item: { id: string; title: string },
  now: string,
): Checklist {
  const next: ChecklistItem = {
    id: item.id,
    title: item.title.trim(),
    checked: false,
  };
  return {
    ...checklist,
    items: [...checklist.items, next],
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
