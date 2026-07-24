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
  changeListIcon: "Change the list’s icon and colour",
  listColorLabel: "Colour",
  listGlyphLabel: "Icon",
  listGlyphNone: "Checklist (default)",
  addItem: "Add item",
  addItemPlaceholder: "Add item…",
  suggestions: "Suggestions from the archive",
  check: "Check item",
  uncheck: "Uncheck item",
  checkAll: "Check all",
  uncheckAll: "Uncheck all",
  archive: "Archive",
  delete: "Delete",
  promoteToCategory: "Promote to category",
  demoteFromCategory: "Remove category",
  setDeadline: "Set deadline",
  deadline: {
    title: "Deadline",
    dueDate: "Due date",
    pickDate: "Pick a date",
    repeat: "Repeat",
    noRepeat: "Doesn’t repeat",
    every: "Every",
    interval: "Repeat interval",
    unitWeek: "weeks",
    unitMonth: "months",
    unitYear: "years",
    clear: "Clear deadline",
    overdue: "Overdue",
    repeats: "Repeats {summary}",
    everyWeekOne: "every week",
    everyWeekOther: "every {n} weeks",
    everyMonthOne: "every month",
    everyMonthOther: "every {n} months",
    everyYearOne: "every year",
    everyYearOther: "every {n} years",
  },
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
  itemCountActions: "Check or uncheck all items",
} as const;

export type AppCatalog = Widen<typeof app>;

export default app;
