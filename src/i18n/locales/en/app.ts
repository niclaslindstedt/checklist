import type { Widen } from "./_widen";

// User-visible strings for the checklist shell itself — the header, the
// empty state, the composer, and the per-row controls. The header title
// stays "checklist" in every language (it's the wordmark), but lives
// here so the shell has a single i18n entry point.

const app = {
  title: "checklist",
  empty: "Nothing here yet — add your first item below.",
  addItem: "Add item",
  addItemPlaceholder: "Add item…",
  check: "Check item",
  uncheck: "Uncheck item",
  archive: "Archive",
  delete: "Delete",
  dragToReorder: "Drag to reorder",
  openSettings: "Open settings",
} as const;

export type AppCatalog = Widen<typeof app>;

export default app;
