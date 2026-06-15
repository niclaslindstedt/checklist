// Pure operations over Checklists. Like templates.ts, callers supply ids and
// timestamps so every function is deterministic and DOM-free.

import type { Checklist, Template } from "./types.ts";

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

export function progress(checklist: Checklist): {
  checked: number;
  total: number;
} {
  return {
    checked: checklist.items.filter((it) => it.checked).length,
    total: checklist.items.length,
  };
}
