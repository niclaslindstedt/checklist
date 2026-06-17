import { useCallback, useRef, useState } from "react";

import { useT } from "../i18n";
import { DismissBackdrop } from "./DismissBackdrop.tsx";
import { useEscapeKey } from "./hooks/useEscapeKey.ts";
import { ArchiveIcon, TrashIcon } from "./icons.tsx";

// The "add item" affordance. On small viewports it's a circular floating
// action button centred at the bottom of the screen — thumb-reachable and
// hard to miss. From the `sm` breakpoint up it relaxes into a normal,
// clearly-styled accent button pinned under the list. Either way, a plain
// tap opens the inline draft row (see `AddItemForm`) rather than adding an
// item directly, so the user types straight into the spot the item lands.
//
// Long-pressing the button fans it out into a floating row of bulk actions
// — archive every finished (checked) item, or delete them. The (+) shrinks
// and fades as the action row scales in over the same spot, so it reads as
// the button morphing into its alternatives. Deleting is destructive, so it
// arms on the first tap and only commits on a confirming second tap. Either
// action (and an outside tap or Escape) transitions straight back to the
// (+).
//
// The horizontal centre is `left: 50%` on the *layout* viewport, matching
// the shell, which is also pinned full-width to the layout viewport (see
// `useViewportHeight`). The visual-viewport width isn't tracked anymore:
// mirroring its fractional width pushed the fixed shell a sub-pixel past the
// edge and let iOS pan sideways, so every layer now stays on the layout box.

// How long the (+) must be held before the bulk-action row fans out.
const LONG_PRESS_MS = 450;

export function AddItemButton({
  onActivate,
  onArchiveFinished,
  onDeleteFinished,
  finishedCount,
}: {
  onActivate: () => void;
  onArchiveFinished: () => void;
  onDeleteFinished: () => void;
  /** Checked-and-active items the bulk actions would sweep; gates them. */
  finishedCount: number;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Set the moment the hold crosses the long-press threshold so the trailing
  // click that ends the press doesn't also open the composer.
  const longPressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The (+) element and the id of the pointer currently pressing it. On a
  // touchscreen the browser sets *implicit pointer capture* to the pointerdown
  // target — the (+). Once the long-press fans the menu out we must hand that
  // capture back, or the (+) (now `pointer-events-none`) keeps swallowing the
  // pointerup that ends the gesture and the bulk buttons under the finger
  // never see it — they "do nothing" on iOS. See `expandMenu`.
  const plusRef = useRef<HTMLButtonElement>(null);
  const pointerId = useRef<number | null>(null);

  // A bulk button just handled the gesture on `pointerup`; swallow the
  // synthetic `click` that trails it so the action doesn't fire twice (which
  // would, for delete, arm *and* commit in one tap).
  const pointerHandled = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const collapse = useCallback(() => {
    setExpanded(false);
    setConfirmingDelete(false);
  }, []);

  useEscapeKey(expanded, collapse);

  // Fan the menu out and release the (+)'s implicit pointer capture so the
  // pointerup (whether the finger lifts in place or slides onto a button)
  // lands on the bulk button under it rather than the hidden (+).
  const expandMenu = useCallback(() => {
    longPressed.current = true;
    setExpanded(true);
    const el = plusRef.current;
    const id = pointerId.current;
    if (el && id !== null && el.hasPointerCapture?.(id)) {
      el.releasePointerCapture(id);
    }
  }, []);

  const startPress = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (expanded) return;
      pointerId.current = e.pointerId;
      longPressed.current = false;
      // Clear any stale flag from a prior cycle (e.g. an archive that
      // collapsed before its trailing click arrived) so it can't swallow a
      // later keyboard / mouse activation.
      pointerHandled.current = false;
      timer.current = setTimeout(expandMenu, LONG_PRESS_MS);
    },
    [expanded, expandMenu],
  );

  const handleClick = useCallback(() => {
    clearTimer();
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onActivate();
  }, [clearTimer, onActivate]);

  const runArchive = useCallback(() => {
    onArchiveFinished();
    collapse();
  }, [onArchiveFinished, collapse]);

  // First tap arms the confirm state; the second commits. Mirrors the
  // two-tap namespace deletion — a bulk destroy warrants the extra beat.
  const runDelete = useCallback(() => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDeleteFinished();
    collapse();
  }, [confirmingDelete, onDeleteFinished, collapse]);

  // Activate on `pointerup` — the reliable signal on iOS for a button that
  // only appears mid-gesture — and mark the gesture handled so the trailing
  // synthetic `click` is dropped. The `click` path stays as the keyboard /
  // mouse fallback (Enter / Space fire no pointer events).
  const onActionPointerUp = useCallback(
    (run: () => void) => () => {
      pointerHandled.current = true;
      run();
    },
    [],
  );
  const onActionClick = useCallback(
    (run: () => void) => () => {
      if (pointerHandled.current) {
        pointerHandled.current = false;
        return;
      }
      run();
    },
    [],
  );

  const noneFinished = finishedCount === 0;
  const deleteLabel = confirmingDelete
    ? t("app.confirmDeleteFinished")
    : t("app.deleteFinished");

  return (
    <>
      {expanded && <DismissBackdrop onDismiss={collapse} />}

      <button
        ref={plusRef}
        type="button"
        onClick={handleClick}
        onPointerDown={startPress}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t("app.addItem")}
        aria-haspopup="true"
        aria-expanded={expanded}
        className={`
          fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20
          left-1/2
          flex h-14 w-14 -translate-x-1/2 touch-none items-center justify-center gap-0 select-none
          rounded-full bg-accent text-3xl leading-none font-bold text-page-bg
          shadow-lg transition-all duration-200 active:scale-95
          sm:static sm:mx-auto sm:mt-3 sm:h-auto sm:w-auto sm:translate-x-0
          sm:gap-2 sm:rounded-md sm:bg-accent/10 sm:px-4 sm:py-2 sm:text-base
          sm:text-accent sm:shadow-none sm:hover:bg-accent/20
          ${expanded ? "pointer-events-none scale-0 opacity-0" : "scale-100 opacity-100"}
        `}
      >
        <span aria-hidden className="-mt-0.5 sm:mt-0">
          +
        </span>
        <span className="hidden sm:inline">{t("app.addItem")}</span>
      </button>

      {/* The bulk-action row that replaces the (+) on long-press: one rounded
          bar split into two glyph-only half-circles — archive (blue) and
          delete (red). Centred on the same spot so it reads as the (+)
          morphing into its alternatives; pressing either transitions back. A
          hairline gap shows the bar's backdrop between the halves so they read
          as two distinct buttons. Non-selectable so the long-press never bares
          a text/element selection on mobile. */}
      <div
        role="group"
        aria-label={t("app.moreActions")}
        aria-hidden={!expanded}
        className={`
          fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-[60]
          flex -translate-x-1/2 touch-none items-center gap-px overflow-hidden
          rounded-full bg-page-bg/40 shadow-lg select-none transition-all duration-200
          ${expanded ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"}
        `}
      >
        <button
          type="button"
          disabled={!expanded || noneFinished}
          onPointerUp={onActionPointerUp(runArchive)}
          onClick={onActionClick(runArchive)}
          aria-label={t("app.archiveFinished")}
          className="
            flex items-center justify-center bg-link px-8 py-4 text-page-bg
            transition-[filter] active:brightness-90 disabled:opacity-40
          "
        >
          <ArchiveIcon className="h-6 w-6" />
        </button>
        <button
          type="button"
          disabled={!expanded || noneFinished}
          onPointerUp={onActionPointerUp(runDelete)}
          onClick={onActionClick(runDelete)}
          aria-label={deleteLabel}
          className={`
            flex items-center justify-center bg-danger px-8 py-4 text-white
            transition-[filter] active:brightness-90 disabled:opacity-40
            ${confirmingDelete ? "animate-pulse ring-2 ring-inset ring-white/80" : ""}
          `}
        >
          <TrashIcon className="h-6 w-6" />
        </button>
      </div>
    </>
  );
}
