import type { Widen } from "./_widen";

// Strings for the left navigation drawer — the floating toggle button,
// the checklist switcher (each list by name, plus "new checklist"), the
// views it links to (the archive), and the archive view's own chrome
// (heading, empty state, and per-row restore).

const nav = {
  open: "Open navigation",
  close: "Close navigation",
  label: "Views",
  checklist: "Checklist",
  checklists: "Checklists",
  newChecklist: "New checklist",
  removeChecklist: "Delete checklist",
  archive: "Archive",
  archiveEmpty: "Nothing archived — swipe an item right to archive it.",
  restore: "Restore item",
  edit: "Edit",
  undo: "Undo",
  redo: "Redo",
} as const;

export type NavCatalog = Widen<typeof nav>;

export default nav;
