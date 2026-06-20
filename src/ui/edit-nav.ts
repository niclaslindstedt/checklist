// Bridges the in-row editor and the keyboard nav bar that floats above the
// soft keyboard while an item is being edited (see `EditNavBar`).
//
// Only one `ChecklistRowEditor` is mounted at a time. When it mounts it
// registers a small handle — the id of the item it edits and a `commit` that
// persists the in-progress title/body and closes the editor. The view reads
// the handle to know *which* row is being edited (so it can light up the bar
// and work out the previous/next item), and calls `commit` before moving
// editing to a neighbour so a half-typed edit is never lost on the jump.
export type ActiveEditor = {
  /** The id of the item the open editor is editing. */
  id: string;
  /** Persist the editor's current title/body and close it. */
  commit: () => void;
};
