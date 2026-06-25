import { createContext, useContext } from "react";

// A tiny one-shot bus the search modal uses to point the checklist view at a
// specific item: after navigating to a list, it asks the view to scroll that
// item into view and flash it once. App owns the pending id as state and the
// checklist view drains it (see `ChecklistView`), clearing it once it has
// scrolled — so the highlight fires exactly once per request rather than
// re-flashing on every later render.
//
// Lives in `ui/` (like `modal-bus` and `checklist-context`) so a `ui`
// component consuming it stays a `ui → ui` edge; App supplies the value.

export type FocusItemBus = {
  /** Ask the checklist view to reveal and flash `itemId` once it renders. */
  requestFocus: (itemId: string) => void;
  /** The item awaiting focus, or null when nothing is pending. */
  pendingId: string | null;
  /** Drop the pending request once the view has acted on it. */
  clearFocus: () => void;
};

// A stable no-op bus so consuming the context without a provider degrades
// gracefully — the transient scroll-and-flash is auxiliary, not load-bearing
// (unlike the checklist context, which throws). App always supplies the real
// bus; a bare `ChecklistView` (e.g. in a test) just never gets a focus request.
const NOOP_BUS: FocusItemBus = {
  requestFocus: () => {},
  pendingId: null,
  clearFocus: () => {},
};

export const FocusItemContext = createContext<FocusItemBus>(NOOP_BUS);

/** The item-focus bus; falls back to an inert no-op when no provider is set. */
export function useFocusItem(): FocusItemBus {
  return useContext(FocusItemContext);
}
