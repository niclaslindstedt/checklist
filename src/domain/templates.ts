// Template-level CRUD and the extraction half of the template ↔ checklist
// round trip. To stay trivially testable, these functions never read the clock
// or generate ids themselves; callers pass an `id`, an ISO `now` timestamp,
// and (where a whole tree is copied) an id factory. All operations are
// immutable — they return new objects.
//
// A `Template` mirrors a `Checklist` (see `ItemList` in `types.ts`), so the
// *item* verbs a template needs — add, edit, delete, reorder, nest, promote to
// category, set a deadline — are the shared generic ones in `item-ops.ts` /
// `item-display.ts`, not re-implementations here. This module owns only what
// is specific to a template: creating one, renaming it, restyling it, and
// pulling one out of an existing checklist.

import { activeItems } from "./archive-ops.ts";
import { cloneItemsUnchecked } from "./item-tree.ts";
import type { Checklist, ChecklistItem, Snapshot, Template } from "./types.ts";

export interface NewTemplate {
  id: string;
  name: string;
  now: string;
  items?: ChecklistItem[];
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

/**
 * Capture an existing checklist as a reusable template — the primary way a
 * template comes into being ("Save as template" on a list).
 *
 * The template is a full mirror of the list as it stands: its name, its icon
 * and accent colour, and its whole item tree with nesting, categories, notes,
 * required flags, and deadlines intact (see `cloneItemsUnchecked`). Only the
 * run-specific state is left behind — checked items come across unchecked, and
 * **archived items are skipped entirely**, since the user already hid them
 * from the list they're capturing.
 *
 * Every node gets a fresh id from `newId`, so the template is independent of
 * the checklist it came from: editing either side afterwards never touches the
 * other.
 */
export function extractTemplate(
  checklist: Checklist,
  id: string,
  now: string,
  newId: () => string,
): Template {
  const template: Template = {
    version: 1,
    id,
    name: checklist.name.trim(),
    items: cloneItemsUnchecked(activeItems(checklist), newId),
    createdAt: now,
    updatedAt: now,
  };
  if (checklist.glyph) template.glyph = checklist.glyph;
  if (checklist.color) template.color = checklist.color;
  return template;
}

/** Rename a template, trimming the new name and bumping `updatedAt`. */
export function renameTemplate(
  template: Template,
  name: string,
  now: string,
): Template {
  const trimmed = name.trim();
  if (!trimmed || trimmed === template.name) return template;
  return { ...template, name: trimmed, updatedAt: now };
}

/**
 * Add a template to the document. Kept here (rather than spread across the
 * hooks) so the `templates[]` array is only ever appended to in one place.
 */
export function addTemplate(snapshot: Snapshot, template: Template): Snapshot {
  return { ...snapshot, templates: [...snapshot.templates, template] };
}

/**
 * Drop a template from the document by id. The checklists stamped out of it
 * are untouched — they're independent copies, and their `templateId` becomes a
 * dangling backward reference that nothing resolves. A no-op (unknown id)
 * returns the same snapshot so it never writes.
 */
export function removeTemplate(snapshot: Snapshot, id: string): Snapshot {
  const templates = snapshot.templates.filter((t) => t.id !== id);
  if (templates.length === snapshot.templates.length) return snapshot;
  return { ...snapshot, templates };
}
