import { useCallback, useState } from "react";
import type { ReactNode } from "react";

// State for the desktop right-click menu (see `ui/ContextMenu.tsx`). Kept in
// its own file so `ContextMenu.tsx` only exports its component (Fast Refresh).
// A list of rows shares one menu: a row calls `open(items, event)` from its
// `onContextMenu`, and the view renders <ContextMenu {...state}/> while
// `state` is set — each row supplies the actions for the thing it represents,
// so the menu itself stays agnostic about item vs. list rows.

export type ContextMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Render the row in the danger accent (a destructive action). */
  danger?: boolean;
};

/** The open coordinates + the actions to show. Null while closed. */
export type ContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
};

// A pointer-bearing event that can suppress the native menu — React's
// `MouseEvent` satisfies it, so callers just hand their `onContextMenu` event
// straight through.
type MenuEvent = {
  preventDefault: () => void;
  clientX: number;
  clientY: number;
};

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);
  const open = useCallback((items: ContextMenuItem[], e: MenuEvent) => {
    e.preventDefault();
    setState({ x: e.clientX, y: e.clientY, items });
  }, []);
  const close = useCallback(() => setState(null), []);
  return { state, open, close };
}
