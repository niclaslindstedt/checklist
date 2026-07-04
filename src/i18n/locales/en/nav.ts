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
  newFolder: "New folder",
  folderName: "Folder name",
  renameFolder: "Rename folder",
  deleteFolder: "Delete folder",
  archive: "Archive",
  archivedLists: "Archived lists",
  storage: "Storage",
  archiveEmpty: "Nothing archived yet.",
  emptyArchive: "Empty archive",
  emptyArchiveConfirm:
    "Permanently delete everything in the archive — archived items and archived lists alike? You can still undo this.",
  restore: "Restore item",
  restoreList: "Restore list",
  undo: "Undo",
  redo: "Redo",
  search: "Search",
} as const;

export type NavCatalog = Widen<typeof nav>;

export default nav;
