import type { Widen } from "./_widen";

// Action confirmations raised by the checklist hooks (and App) whenever
// something happens that the user can't immediately see the result of —
// a delete, an archive, a restore, an undo, a namespace coming or going.
// The `item*` / `list*` strings double as the labels stored on the undo
// timeline, which is why `undone` / `redone` interpolate one of them as
// `{action}`.

const toast = {
  region: "Notifications",
  dismiss: "Dismiss",
  itemAdded: "Added “{title}”",
  itemEdited: "Edited “{title}”",
  itemChecked: "Checked “{title}”",
  itemUnchecked: "Unchecked “{title}”",
  itemRescheduled: "Rescheduled “{title}”",
  deadlineSet: "Set a deadline on “{title}”",
  deadlineCleared: "Cleared the deadline on “{title}”",
  allChecked: "Checked all items",
  allUnchecked: "Unchecked all items",
  itemDeleted: "Deleted “{title}”",
  emptyItemRemoved: "Removed empty item",
  itemArchived: "Archived “{title}”",
  itemPromoted: "Made “{title}” a category",
  itemDemoted: "“{title}” is an item again",
  itemRestored: "Restored “{title}”",
  itemMoved: "Moved “{title}”",
  itemsImported: "Imported {count} items",
  itemsArchived: "Archived {count} finished",
  itemsDeleted: "Deleted {count} finished",
  archiveEmptied: "Emptied the archive",
  listCreated: "Created list “{name}”",
  listRenamed: "Renamed list to “{name}”",
  listRestyled: "Restyled list",
  listDeleted: "Deleted list “{name}”",
  listArchived: "Archived list “{name}”",
  listRestored: "Restored list “{name}”",
  listMovedToFolder: "Moved to “{name}”",
  listUnfiled: "Removed from folder",
  listMovedToNamespace: "Moved to “{name}”",
  listMoveFailed: "Couldn’t move the list — try again",
  listKeepLast: "Keep at least one list in a namespace",
  folderCreated: "Created folder “{name}”",
  folderRenamed: "Renamed folder to “{name}”",
  folderDeleted: "Deleted folder “{name}”",
  folderMovedToNamespace: "Moved folder to “{name}”",
  folderMoveFailed: "Couldn’t move the folder — try again",
  namespaceCreated: "Created namespace “{name}”",
  namespaceDeleted: "Deleted namespace “{name}”",
  undone: "Undone: {action}",
  redone: "Redone: {action}",
} as const;

export type ToastCatalog = Widen<typeof toast>;

export default toast;
