// Pure operations over Templates. To stay trivially testable, these functions
// never read the clock or generate ids themselves; callers pass an `id` and an
// ISO `now` timestamp. All operations are immutable — they return new objects.

import type { Item, Template } from "./types.ts";

export interface NewTemplate {
  id: string;
  name: string;
  now: string;
  items?: Item[];
}

export function createTemplate({
  id,
  name,
  now,
  items = [],
}: NewTemplate): Template {
  return {
    version: 1,
    id,
    name: name.trim(),
    items,
    createdAt: now,
    updatedAt: now,
  };
}

export function renameTemplate(
  template: Template,
  name: string,
  now: string,
): Template {
  return { ...template, name: name.trim(), updatedAt: now };
}

export function addItem(template: Template, item: Item, now: string): Template {
  return {
    ...template,
    items: [...template.items, item],
    updatedAt: now,
  };
}

export function removeItem(
  template: Template,
  itemId: string,
  now: string,
): Template {
  return {
    ...template,
    items: template.items.filter((it) => it.id !== itemId),
    updatedAt: now,
  };
}
