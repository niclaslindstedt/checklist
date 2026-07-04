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
//
// This file re-exports each module's public surface so the ~10 importing files
// (and the domain tests) keep a single import site. Items form a tree: each
// `ChecklistItem` may carry `children`, built up by dropping one item onto
// another while dragging (see `moveItemInto` in `item-display.ts`).

export { findItem, flattenItems } from "./item-tree.ts";

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
  addItem,
  addItemAfter,
  addItems,
  addItemsAfter,
  deleteItem,
  editItem,
  setAllChecked,
  toggleItem,
} from "./item-ops.ts";

export {
  displayItems,
  flattenForDisplay,
  isComplete,
  moveDisplayedItem,
  moveItem,
  moveItemInto,
  progress,
  sortCheckedToBottom,
} from "./item-display.ts";
export type { DisplayRow, DropMode } from "./item-display.ts";
