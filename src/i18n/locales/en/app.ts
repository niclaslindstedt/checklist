import type { Widen } from "./_widen";

// User-visible strings for the checklist shell itself — the header, the
// empty state, the composer, and the per-row controls. The header title
// shows the active checklist's name (click it to rename); `title` is the
// document/tab fallback. Lives here so the shell has a single i18n entry
// point.

const app = {
  title: "checklist",
  empty: "Nothing here yet — add your first item below.",
  renameChecklist: "Rename checklist",
  addItem: "Add item",
  addItemPlaceholder: "Add item…",
  check: "Check item",
  uncheck: "Uncheck item",
  archive: "Archive",
  delete: "Delete",
  editItem: "Edit item",
  editNote: "Edit note",
  editTitlePlaceholder: "Item text…",
  notePlaceholder: "Add a note… (markdown supported)",
  addNote: "Add a note",
  addSubitem: "Add sub-item",
  showNote: "Show note",
  hideNote: "Hide note",
  showSubitems: "Show sub-items",
  hideSubitems: "Hide sub-items",
  moreActions: "More actions",
  archiveFinished: "Archive finished",
  deleteFinished: "Delete finished",
  dragToReorder: "Drag to reorder",
  openSettings: "Open settings",
  copyChecklist: "Copy checklist as markdown",
  copied: "Copied",
  copyFailed: "Couldn't copy to the clipboard",
  itemCount: "{checked} of {total} items checked",
} as const;

export type AppCatalog = Widen<typeof app>;

export default app;
