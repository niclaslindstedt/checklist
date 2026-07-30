// Checklist-level CRUD and metadata: creating lists (from a template or empty),
// renaming, styling (icon / accent colour), archiving the whole list, and the
// snapshot-level queries that partition lists into active vs. archived. These
// operate on a `Checklist` (or a `Snapshot` of them) as a whole and never walk
// the item tree, so they stand apart from the item operations in
// `checklists.ts`. Like the rest of the domain layer, callers supply ids and
// timestamps so every function is deterministic and DOM-free.

import { cloneItemsUnchecked } from "./item-tree.ts";
import type {
  Checklist,
  ChecklistAppearance,
  ItemList,
  Snapshot,
  Template,
} from "./types.ts";

/**
 * Stamp out an independent, checkable instance from a template — the second
 * half of the round trip `extractTemplate` opens.
 *
 * The new list is everything the template describes: its name, its icon and
 * accent colour, and its whole item tree with nesting, categories, notes,
 * required flags, and deadlines intact, every item unchecked. Every node gets
 * a fresh id from `newId`, so the list is fully independent — checking things
 * off it never writes back into the template, and later edits to the template
 * never reach lists already stamped from it. `templateId` records where it
 * came from as a backward reference only.
 */
export function instantiate(
  template: Template,
  id: string,
  now: string,
  newId: () => string,
): Checklist {
  const checklist: Checklist = {
    version: 1,
    id,
    templateId: template.id,
    name: template.name,
    items: cloneItemsUnchecked(template.items, newId),
    createdAt: now,
    updatedAt: now,
  };
  if (template.glyph) checklist.glyph = template.glyph;
  if (template.color) checklist.color = template.color;
  return checklist;
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
 * Set or clear a checklist's appearance (its icon and/or accent colour). A
 * field set to a non-empty value is written; `null` (or an empty string)
 * clears it, dropping the key entirely so an unstyled list round-trips
 * minimally. A no-op (nothing actually changed) returns the same checklist
 * untouched, so it never bumps `updatedAt` or triggers a write. Mirrors
 * `setNamespaceAppearance` for the per-list case.
 *
 * Generic over {@link ItemList}, so a template is restyled by the same verb as
 * a checklist — and the style it carries rides along into every list stamped
 * out of it (see `instantiate`).
 */
export function setChecklistAppearance<L extends ItemList>(
  checklist: L,
  patch: ChecklistAppearance,
  now: string,
): L {
  const next: L = { ...checklist };
  let changed = false;
  if ("glyph" in patch) {
    if (patch.glyph) {
      if (next.glyph !== patch.glyph) {
        next.glyph = patch.glyph;
        changed = true;
      }
    } else if (next.glyph !== undefined) {
      delete next.glyph;
      changed = true;
    }
  }
  if ("color" in patch) {
    if (patch.color) {
      if (next.color !== patch.color) {
        next.color = patch.color;
        changed = true;
      }
    } else if (next.color !== undefined) {
      delete next.color;
      changed = true;
    }
  }
  if (!changed) return checklist;
  next.updatedAt = now;
  return next;
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
