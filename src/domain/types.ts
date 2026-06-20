// Core data model for checklist. These types are plain JSON and carry no
// behavior; the functions in this folder operate over them. Nothing here may
// import from ui/, storage/, the DOM, or fetch (see AGENTS.md).

/** A single checkable line in a template or checklist. */
export interface Item {
  id: string;
  title: string;
  notes?: string;
  required?: boolean;
}

/** A reusable, named list of items. Identified by a stable UUIDv7 `id`. */
export interface Template {
  /** Reserved for future migrations; there is only one version today. */
  version: 1;
  id: string;
  name: string;
  items: Item[];
  createdAt: string;
  updatedAt: string;
}

/** A checked item within a checklist instance. */
export interface ChecklistItem extends Item {
  checked: boolean;
  /**
   * Archived items stay in the document but drop out of the active view.
   * Swiping an item right marks it archived so it disappears without being
   * destroyed; the archive view (reached from the side menu) lists them and
   * can restore or delete each one. Absent means active.
   */
  archived?: boolean;
  /**
   * When the item was last checked off (ISO-8601). Stamped by `toggleItem`
   * on the false→true flip and cleared when it's unchecked, so it only
   * exists while `checked` is true. Drives the "sort checked to the bottom"
   * view order — the most recently checked item heads the checked group —
   * without ever reordering the stored document. Absent for items checked
   * before this field existed (they sink last among the checked ones).
   */
  checkedAt?: string;
  /**
   * Nested sub-items. An item becomes a child of another by dropping it onto
   * that item while dragging (see `moveItemInto`). A parent's checked state
   * cascades to its whole subtree — checking a parent checks every
   * descendant, unchecking unchecks them (see `toggleItem`). The "sort
   * checked to the bottom" order applies within each sub-list independently.
   * Absent (rather than an empty array) when an item has no children, so a
   * leaf round-trips byte-for-byte.
   */
  children?: ChecklistItem[];
}

/**
 * An instance stamped out from a template at a point in time. Ad-hoc lists
 * created straight from the checklist view (not from any template) carry an
 * empty `templateId`.
 */
export interface Checklist {
  version: 1;
  id: string;
  templateId: string;
  name: string;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

/** The full document persisted by a storage backend. */
export interface Snapshot {
  templates: Template[];
  checklists: Checklist[];
}

export function emptySnapshot(): Snapshot {
  return { templates: [], checklists: [] };
}
