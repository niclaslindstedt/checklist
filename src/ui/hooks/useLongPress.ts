// Long-press gesture for touch (and pen) — the finger-held counterpart of a
// desktop right-click. A checklist row wires this alongside its swipe handlers
// so holding still on a row opens the same context menu the desktop pointer
// reaches with a secondary click (see `ChecklistView`'s row menu). Mouse
// pointers are ignored: a real right-click already fires `contextmenu`, so the
// timer would only double up.
//
// It coexists with `useRowSwipe`: the two share the row's pointer stream, but a
// swipe *moves*, which cancels the hold before the timer fires, while a hold
// *stays put*, which cancels nothing. When the hold fires we mark it so the
// trailing `click` (the finger lifting) is swallowed rather than editing the
// row. On Android the browser also raises a native `contextmenu` after the
// hold — `onContextMenu` opens our menu from it (and suppresses the native one)
// while guarding against a double-open when the timer already fired; iOS,
// which doesn't fire `contextmenu` on a hold, relies on the timer alone.

import { useCallback, useRef, type PointerEvent } from "react";

// How long the finger must rest before the menu opens — matches the add
// button's long-press threshold so holds feel uniform across the app.
const LONG_PRESS_MS = 450;
// Movement (px) that reclassifies the hold as a scroll / swipe and cancels it.
const MOVE_CANCEL = 10;

export interface LongPress {
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
    onPointerCancel: (e: PointerEvent<HTMLElement>) => void;
    onClickCapture: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
}

export function useLongPress(
  onLongPress: (x: number, y: number) => void,
): LongPress {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  // Set when a hold (or the native contextmenu it triggers) has opened the
  // menu, so the trailing click is swallowed and a second opener is ignored.
  const fired = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      // Mouse gets the real right-click path; only touch / pen holds arm here.
      if (e.pointerType === "mouse") return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const { clientX, clientY } = e;
      clearTimer();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress(clientX, clientY);
      }, LONG_PRESS_MS);
    },
    [clearTimer, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (timer.current === null) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.abs(dx) > MOVE_CANCEL || Math.abs(dy) > MOVE_CANCEL) clearTimer();
    },
    [clearTimer],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!fired.current) return;
    // The hold already opened the menu — don't let the lift edit the row.
    e.preventDefault();
    e.stopPropagation();
    fired.current = false;
  }, []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Suppress the platform's own long-press menu; open ours in its place
      // unless the timer beat it to the punch.
      e.preventDefault();
      if (fired.current) return;
      clearTimer();
      fired.current = true;
      onLongPress(e.clientX, e.clientY);
    },
    [clearTimer, onLongPress],
  );

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clearTimer,
      onPointerCancel: clearTimer,
      onClickCapture,
      onContextMenu,
    },
  };
}
