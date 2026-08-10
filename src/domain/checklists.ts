// Pure operations over Checklists — the public barrel for the domain layer.
//
// The implementation is split by concern across sibling modules, all of which
// keep callers supplying ids and timestamps so every function stays
// deterministic and DOM-free:
//
// - `item-tree.ts`     — tree primitives (walk / find / update / remove / map).
// - `checklist-ops.ts` — checklist-level CRUD/metadata (create, rename,
//                        appearance, archive, active/archived snapshot queries).
// - `archive-ops.ts`   — archive/restore items and the archived-items queries.
// - `item-ops.ts`      — add / edit / delete / toggle / bulk-check items.
// - `item-display.ts`  — move / reorder and the display-order view transforms.
// - `templates.ts`     — template CRUD and extraction from a checklist.
//
// The item-level modules are generic over `ItemList` (the shape a `Checklist`
// and a `Template` share), so a template is edited by exactly the same verbs as
// a list rather than a parallel set that would drift.
//
// This file re-exports each module's public surface so the ~10 importing files
// (and the domain tests) keep a single import site. Items form a tree: each
// `ChecklistItem` may carry `children`, built up by dropping one item onto
// another while dragging (see `moveItemInto` in `item-display.ts`).

export { cloneItemsUnchecked, findItem, flattenItems } from "./item-tree.ts";

export {
  addTemplate,
  createTemplate,
  extractTemplate,
  removeTemplate,
  renameTemplate,
} from "./templates.ts";

export {
  activeChecklists,
  archivedChecklists,
  createChecklist,
  instantiate,
  nextChecklistName,
  renameChecklist,
  setChecklistAppearance,
  setChecklistArchived,
} from "./checklist-ops.ts";

export {
  activeItems,
  archiveChecked,
  archivedByChecklist,
  archivedItems,
  deleteChecked,
  emptyArchive,
  setArchived,
} from "./archive-ops.ts";
export type { ArchivedGroup } from "./archive-ops.ts";

export {
  activeCategories,
  addItem,
  addItemAfter,
  addItems,
  addItemsAfter,
  deleteItem,
  editItem,
  setAllChecked,
  setCategory,
  setItemTiming,
  toggleItem,
} from "./item-ops.ts";

export {
  addRecurrence,
  daysUntil,
  deadlineStatus,
  isHeldBack,
  nextOccurrence,
} from "./deadlines.ts";
export type { DeadlineStatus } from "./deadlines.ts";

export {
  countableItems,
  displayItems,
  flattenForDisplay,
  floatDatedToTop,
  isComplete,
  moveDisplayedItem,
  moveItem,
  moveItemInto,
  progress,
  sinkHeldToBottom,
  sortCheckedToBottom,
  DOCUMENT_ORDER,
} from "./item-display.ts";
export type { DisplayOrder, DisplayRow, DropMode } from "./item-display.ts";
