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
}

/** An instance stamped out from a template at a point in time. */
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
