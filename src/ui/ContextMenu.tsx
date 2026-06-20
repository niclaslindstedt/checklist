import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DismissBackdrop } from "./DismissBackdrop.tsx";
import { useEscapeKey } from "./hooks/useEscapeKey.ts";
import type { ContextMenuItem } from "./hooks/useContextMenu.ts";

// A right-click (desktop) dropdown menu, anchored at the pointer rather than
// to a trigger element the way `FloatingPanel` is. The list rows whose
// trailing actions used to live behind a swipe gesture (archive / delete an
// item, restore / delete an archived one, archive / delete a whole list)
// surface those same actions here on a device with a real secondary click —
// see `useDesktopPointer`. Touch devices keep their swipe / tap affordances.
//
// Portalled to `document.body` over a `DismissBackdrop` (outside-tap closes
// it) with Escape-to-close, and clamped into the viewport after it measures
// so it never spills off the screen edge when opened near a corner. State and
// the action shape live in `hooks/useContextMenu.ts`.

const MARGIN = 8;

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  useEscapeKey(true, onClose);
  const ref = useRef<HTMLDivElement>(null);
  // Open at the pointer, then nudge back inside the viewport once we know the
  // rendered size. Starting at the raw pointer keeps the first paint anchored
  // where the user clicked; the clamp only moves it when it would overflow.
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + width > window.innerWidth - MARGIN) {
      left = window.innerWidth - MARGIN - width;
    }
    if (top + height > window.innerHeight - MARGIN) {
      top = window.innerHeight - MARGIN - height;
    }
    setPos({ left: Math.max(MARGIN, left), top: Math.max(MARGIN, top) });
  }, [x, y]);

  return createPortal(
    <>
      <DismissBackdrop onDismiss={onClose} />
      <div
        ref={ref}
        role="menu"
        tabIndex={-1}
        // Suppress the native menu when a second right-click lands on ours.
        onContextMenu={(e) => e.preventDefault()}
        className="fixed z-[60] min-w-[10rem] overflow-hidden rounded border border-line bg-surface-2 py-1 shadow-lg outline-none"
        style={{ left: pos.left, top: pos.top }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm ${
              item.danger
                ? "text-danger hover:bg-danger/10"
                : "text-fg hover:bg-surface-3 hover:text-fg-bright"
            }`}
          >
            {item.icon && (
              <span className={item.danger ? "" : "text-muted"}>
                {item.icon}
              </span>
            )}
            <span className="flex-1">{item.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
