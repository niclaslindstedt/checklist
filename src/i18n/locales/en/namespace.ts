import type { Widen } from "./_widen";

// Strings for namespaces — the named buckets that each hold their own
// checklist. The switcher and "new namespace" action live at the top of
// the navigation drawer; the management surface (rename / delete / add)
// is a small modal opened from there.

const namespace = {
  section: "Namespace",
  active: "Active namespace",
  switchTo: "Switch to {name}",
  newAction: "New namespace",
  manage: "Manage namespaces",
  heading: "Namespaces",
  blurb:
    "Each namespace keeps its own checklist in its own folder, so you can share one namespace's folder (say, with family) without sharing the rest.",
  nameLabel: "Name",
  namePlaceholder: "e.g. Family",
  create: "Create",
  rename: "Rename",
  renameAction: "Rename namespace",
  deleteAction: "Delete namespace",
  confirmDelete: "Confirm",
  delete: "Delete",
  cancel: "Cancel",
  save: "Save",
  deleteConfirm:
    "Delete “{name}” and its checklist? This removes its data from the current storage backend.",
  defaultBadge: "default",
  nameRequired: "A namespace name is required.",
  appearance: "Appearance",
  colorLabel: "Colour",
  glyphLabel: "Icon",
  glyphNone: "No icon",
} as const;

export type NamespaceCatalog = Widen<typeof namespace>;

export default namespace;
