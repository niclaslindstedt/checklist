import { createContext, useContext } from "react";

// A tiny one-shot bus the side menu uses to point the checklist view at a
// just-created list: "this one still needs a name — open its title field".
// The header title (`ChecklistTitle`) mounts straight into its rename input
// with the default name selected, so the list can be named without a second
// tap. App owns the pending id as state and the checklist view drains it once
// it has rendered, so the request fires exactly once rather than re-opening
// the field on every later render.
//
// Timing is the point of the bus, not just plumbing: the side menu dispatches
// the request inside `flushSync`, so the title field mounts and takes focus
// while the creating tap is still being handled — the only context in which
// iOS raises the soft keyboard for a programmatic focus.
//
// Lives in `ui/` (like `focus-item` and `modal-bus`) so a `ui` component
// consuming it stays a `ui → ui` edge; App supplies the value.

export type RenameChecklistBus = {
  /** Ask the checklist view to open `checklistId`'s title field on arrival. */
  requestRename: (checklistId: string) => void;
  /** The checklist awaiting a name, or null when nothing is pending. */
  pendingId: string | null;
  /** Drop the pending request once the view has acted on it. */
  clearRename: () => void;
};

// A stable no-op bus so consuming the context without a provider degrades
// gracefully — opening the field is a convenience, not load-bearing (unlike
// the checklist context, which throws). App always supplies the real bus; a
// bare `SideMenu` (e.g. in a test) just creates lists without opening one.
const NOOP_BUS: RenameChecklistBus = {
  requestRename: () => {},
  pendingId: null,
  clearRename: () => {},
};

export const RenameChecklistContext =
  createContext<RenameChecklistBus>(NOOP_BUS);

/** The name-a-new-list bus; falls back to an inert no-op with no provider. */
export function useRenameChecklist(): RenameChecklistBus {
  return useContext(RenameChecklistContext);
}
