import { createContext, useContext } from "react";

import type { MenuButtonPosition } from "../settings/types.ts";

// Top-level navigation state — which view is showing, the drawer's
// open/close, the floating button's resting position and live drag flag —
// shared through context so `SideMenu` reads it instead of App threading
// the nav props down. Mirrors `modal-bus.ts`: the context and its consumer
// hook live in `ui/`, App owns the state and supplies the value.

/** The top-level views the drawer switches between. */
export type View = "checklist" | "archive";

export type NavContextValue = {
  /** Whether the navigation drawer is open. */
  open: boolean;
  /** The currently-selected top-level view. */
  current: View;
  /** Toggle the drawer open/closed. */
  toggle: () => void;
  /** Close the drawer. */
  close: () => void;
  /** Switch to a view and close the drawer. */
  navigate: (view: View) => void;
  /**
   * Report whether the floating button is mid-drag, so App can suppress
   * competing global gestures (pull-to-refresh) while dragging it around.
   */
  setDragging: (dragging: boolean) => void;
  /** Where the floating button rests. */
  position: MenuButtonPosition;
  /** Persist a new resting spot after the user drags the button. */
  setPosition: (next: MenuButtonPosition) => void;
};

export const NavContext = createContext<NavContextValue | null>(null);

/** The shared nav state; throws if no provider is mounted above. */
export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("nav context used outside <NavContext.Provider>");
  return ctx;
}
