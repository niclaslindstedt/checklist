// Applies the checklists' reset schedules. A scheduled reset can only happen
// while the app is running, so this hook re-checks the document for due
// resets at the moments that matter — once the backend's first load lands
// (the "opened the app" case), whenever the tab comes back into view (the
// installed PWA is resumed rather than relaunched), and on a coarse timer so
// a list left open across its reset time still turns over. Each due list is
// unchecked through the same commit path as a user edit (visible document,
// debounced save, undo timeline), so the reset is recoverable, and a toast
// says which list turned over.
//
// Two guards keep a reset from firing twice:
//
//  - The document records the occurrence each reset was applied against
//    (`lastResetAt`), so across launches and devices the same occurrence is
//    never re-applied — the pure `dueResets` reads it.
//  - A per-session memory of the occurrences applied here covers the one
//    path the document can't: an undo. Undoing a reset restores the checks
//    *and* the older `lastResetAt`, which would otherwise make the very next
//    check re-apply the occurrence the user just reverted.
//
// Lists whose schedule asks for it are queued for the pop-up
// (`ResetPopupModal`): the freshly reset list shown over whatever list is on
// screen, one at a time, dismissed with its close button.

import { useCallback, useEffect, useRef, useState } from "react";
// `preact/compat` has no `MutableRefObject`; `MutableRef` is Preact's name for
// the same always-populated `{ current: T }` shape `useRef<T>(init)` returns.
import type { MutableRef } from "preact/hooks";

import { applyResets, dueResets } from "../domain/checklists.ts";
import type { Snapshot } from "../domain/types.ts";
import type { TFunction } from "../i18n";
import type { Notify } from "./notify.ts";
import { now } from "./side-effects.ts";

// How often to re-check while the app stays open. Schedules resolve to the
// minute, so a minute's granularity is exact; nothing here is expensive.
export const RESET_CHECK_INTERVAL_MS = 60_000;

export interface ScheduledResets {
  /**
   * The list whose fresh, just-reset state the pop-up should show, or null
   * when nothing is pending. Several resets queue up; each dismissal reveals
   * the next.
   */
  resetPopupListId: string | null;
  /** Dismiss the pop-up for the list at the head of the queue. */
  dismissResetPopup: () => void;
}

export function useScheduledResets(deps: {
  /** Latest document, read at check time rather than subscribed to. */
  docRef: MutableRef<Snapshot>;
  /** Gate until the backend's first load resolves — never reset a stale seed. */
  loaded: boolean;
  /** Swap the visible document for an immediate re-render. */
  setDoc: (next: Snapshot) => void;
  /** Persist the edited document (debounced by the active backend). */
  scheduleSave: (next: Snapshot) => void;
  /** Record the post-reset document — tagged with its action label — on the undo timeline. */
  record: (next: Snapshot, label: string) => void;
  /** Raise a toast naming the list that turned over. */
  notify: Notify;
  /** Translator for the toast / undo label. */
  t: TFunction;
}): ScheduledResets {
  const { docRef, loaded, setDoc, scheduleSave, record, notify, t } = deps;

  const [popupQueue, setPopupQueue] = useState<string[]>([]);
  // Occurrences applied in this session, by list id — the undo guard.
  const applied = useRef(new Map<string, string>());

  // Held in a ref so the effects below can call the latest check without
  // re-subscribing the listeners on every render.
  const checkRef = useRef<() => void>(() => {});
  checkRef.current = () => {
    const prev = docRef.current;
    const at = now();
    const due = dueResets(prev, at).filter(
      (d) => applied.current.get(d.checklist.id) !== d.resetAt,
    );
    if (due.length === 0) return;
    for (const d of due) applied.current.set(d.checklist.id, d.resetAt);
    const next = applyResets(prev, due, at);
    // One undo entry per pass, labelled with the first list (the usual case
    // is a single list turning over); the toast names each.
    const label = t("toast.listReset", { name: due[0]!.checklist.name });
    setDoc(next);
    scheduleSave(next);
    record(next, label);
    for (const d of due) {
      notify(t("toast.listReset", { name: d.checklist.name }));
    }
    const popups = due
      .filter((d) => d.checklist.resetSchedule?.popUp)
      .map((d) => d.checklist.id);
    if (popups.length > 0) {
      setPopupQueue((queue) => [
        ...queue,
        ...popups.filter((id) => !queue.includes(id)),
      ]);
    }
  };

  // The "opened the app" check: once the first load resolves (and again after
  // a backend or namespace swap re-loads the document).
  useEffect(() => {
    if (!loaded) return;
    checkRef.current();
  }, [loaded]);

  // Resumed from the background, and the coarse timer while open.
  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") checkRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(
      () => checkRef.current(),
      RESET_CHECK_INTERVAL_MS,
    );
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [loaded]);

  const dismissResetPopup = useCallback(() => {
    setPopupQueue((queue) => queue.slice(1));
  }, []);

  return {
    resetPopupListId: popupQueue[0] ?? null,
    dismissResetPopup,
  };
}
