// Archive operations over a checklist's item tree: hiding finished or
// individual items without destroying them, and the queries that surface what
// has been archived. An archived item stays in the stored document but drops
// out of the active view; its subtree travels with it. These compose over the
// tree primitives in `item-tree.ts`. Like the rest of the domain layer,
// callers supply timestamps so every function is deterministic and DOM-free.

import {
  flattenItems,
  mapTree,
  updateItem,
  withChildren,
} from "./item-tree.ts";
import type { Checklist, ChecklistItem, Snapshot } from "./types.ts";

/**
 * Archive every finished (checked) item still in the active list in one
 * sweep — the bulk counterpart to `setArchived`. Archived items are left
 * untouched (they're already out of the active list). **Category** headers
 * are skipped even when checked: a category stays put to be refilled while
 * its finished children drop into the archive from underneath it. A no-op
 * (nothing checked, active, and non-category) returns the same checklist, so
 * it never writes.
 */
export function archiveChecked(checklist: Checklist, now: string): Checklist {
  if (
    !flattenItems(checklist.items).some(
      (it) => it.checked && !it.archived && !it.category,
    )
  ) {
    return checklist;
  }
  return {
    ...checklist,
    items: mapTree(checklist.items, (it) =>
      it.checked && !it.archived && !it.category
        ? { ...it, archived: true }
        : it,
    ),
    updatedAt: now,
  };
}

/**
 * Permanently remove every finished (checked) item from the active list in
 * one sweep — the bulk counterpart to `deleteItem`. Archived items are kept
 * (they've left the active list already). A **category** header is kept even
 * when checked — the sweep still recurses into it to clear its finished
 * children, so the category survives (emptied of what was done) rather than
 * vanishing with its subtree. A no-op returns the same checklist untouched.
 */
export function deleteChecked(checklist: Checklist, now: string): Checklist {
  if (
    !flattenItems(checklist.items).some(
      (it) => it.checked && !it.archived && !it.category,
    )
  ) {
    return checklist;
  }
  // Drop every finished node and its subtree, recursing into the survivors so
  // a finished item nested under an unchecked parent is swept too. A checked
  // category isn't dropped — we keep it and prune its children, so the header
  // stays behind ready to be refilled.
  const prune = (list: readonly ChecklistItem[]): ChecklistItem[] => {
    const out: ChecklistItem[] = [];
    for (const it of list) {
      if (it.checked && !it.archived && !it.category) continue;
      out.push(it.children ? withChildren(it, prune(it.children)) : it);
    }
    return out;
  };
  return { ...checklist, items: prune(checklist.items), updatedAt: now };
}

/**
 * Permanently empty the archive across the whole document: drop every
 * wholly-archived checklist, and prune every archived item (and its subtree)
 * from the surviving active lists. The bulk counterpart to the archive view's
 * per-row Delete, acting on both kinds of archived thing at once. A no-op
 * (nothing archived anywhere) returns the same snapshot, so it never writes.
 */
export function emptyArchive(snapshot: Snapshot, now: string): Snapshot {
  const hasArchived = snapshot.checklists.some(
    (c) => c.archived || flattenItems(c.items).some((it) => it.archived),
  );
  if (!hasArchived) return snapshot;
  const checklists = snapshot.checklists
    .filter((c) => !c.archived)
    .map((c) =>
      flattenItems(c.items).some((it) => it.archived)
        ? { ...c, items: activeItems(c), updatedAt: now }
        : c,
    );
  return { ...snapshot, checklists };
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
