import { useCallback, useEffect, useRef, useState } from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { APP_VIEWPORT_RECT } from "./appViewportRect.ts";
import { useEscapeKey } from "./hooks/useEscapeKey.ts";
import { CloseIcon, RestoreIcon } from "./icons.tsx";

// The archived-items drawer — a bottom sheet raised by swiping up at the
// foot of a checklist (see `useSwipeUpReveal`). It lists just the active
// list's archived items so the user can peek at, restore, or delete them
// without leaving the list for the full archive view.
//
// Dismissed three ways: the X in its header, a downward swipe on that same
// header (the grab area), or Escape / a backdrop tap. The sheet follows the
// finger during a header drag and either snaps back or slides out on
// release, so the gesture reads as physical. It slides up on open and down
// on close via a CSS transform transition.

// Downward header travel (px) past which release dismisses the drawer.
const DISMISS_DISTANCE = 72;

type Props = {
  open: boolean;
  onClose: () => void;
  /** The active list's name, shown in the drawer header. */
  listName: string;
  /** The active list's archived items (roots of each archived subtree). */
  items: readonly ChecklistItem[];
  /** Restore an archived item back into its list. */
  onRestore: (id: string) => void;
  /** Permanently delete an archived item. */
  onDelete: (id: string) => void;
};

export function ArchivedDrawer({
  open,
  onClose,
  listName,
  items,
  onRestore,
  onDelete,
}: Props) {
  const t = useT();
  // `entered` drives the slide-up: false on the first commit so the sheet
  // starts translated fully off-screen, flipped true on the next frame so the
  // transition animates it into place. `closing` slides it back down and,
  // once the transform transition ends, calls `onClose`.
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  // Live downward offset (px) while the header is being dragged; null when no
  // drag owns the sheet, so the CSS transition governs the transform instead.
  const [dragY, setDragY] = useState<number | null>(null);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setClosing(false);
      setDragY(null);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const requestClose = useCallback(() => {
    dragStartY.current = null;
    setDragY(null);
    setClosing(true);
  }, []);

  useEscapeKey(open && !closing, requestClose);

  const onHeaderTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;
    dragStartY.current = touch.clientY;
    setDragY(0);
  };
  const onHeaderTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    // Only downward travel moves the sheet — an upward drag on the header does
    // nothing (the list below owns any scroll).
    setDragY(Math.max(0, touch.clientY - dragStartY.current));
  };
  const onHeaderTouchEnd = () => {
    const offset = dragY ?? 0;
    dragStartY.current = null;
    if (offset >= DISMISS_DISTANCE) requestClose();
    else setDragY(null); // snap back
  };

  if (!open) return null;

  // Off-screen until entered, back off-screen while closing, finger-tracked
  // during a header drag, resting at 0 otherwise.
  const transform =
    dragY !== null
      ? `translateY(${dragY}px)`
      : entered && !closing
        ? "translateY(0)"
        : "translateY(100%)";

  return (
    <div
      className="fixed z-40 flex items-end justify-center"
      style={APP_VIEWPORT_RECT}
    >
      <button
        type="button"
        aria-label={t("common.close")}
        tabIndex={-1}
        onClick={requestClose}
        className={`absolute inset-0 cursor-default bg-black/40 transition-opacity duration-200 ${
          entered && !closing ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="archived-drawer-title"
        className="relative flex max-h-[70svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-line bg-surface text-fg shadow-xl outline-none"
        style={{
          transform,
          transition: dragY === null ? "transform 200ms ease-out" : "none",
        }}
        onTransitionEnd={(e) => {
          if (closing && e.propertyName === "transform") onClose();
        }}
      >
        {/* The header doubles as the swipe-down grab area — a drag on it (or
            the pill handle) dismisses the drawer. */}
        <header
          onTouchStart={onHeaderTouchStart}
          onTouchMove={onHeaderTouchMove}
          onTouchEnd={onHeaderTouchEnd}
          className="flex shrink-0 touch-none flex-col border-b border-line"
        >
          <div className="flex justify-center pt-2 pb-1">
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-line" />
          </div>
          <div className="flex items-center justify-between gap-2 px-4 pb-2">
            <h2
              id="archived-drawer-title"
              className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-wide text-fg-bright"
            >
              <span className="truncate">
                {t("nav.archiveDrawerTitle", { name: listName })}
              </span>
              <span className="shrink-0 text-muted tabular-nums">
                {items.length}
              </span>
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label={t("common.close")}
              title={t("common.close")}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain] pb-[env(safe-area-inset-bottom)]">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              {t("nav.archiveDrawerEmpty")}
            </p>
          ) : (
            <ul className="m-0 list-none p-0">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex min-h-11 items-center gap-3 border-b border-line px-4 py-2"
                >
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      item.checked ? "text-muted line-through" : "text-fg"
                    }`}
                  >
                    {item.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRestore(item.id)}
                    aria-label={t("nav.restore")}
                    title={t("nav.restore")}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
                  >
                    <RestoreIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    aria-label={t("app.delete")}
                    title={t("app.delete")}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
