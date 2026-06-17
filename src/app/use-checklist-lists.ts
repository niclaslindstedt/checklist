// The checklist *collection* verbs: selecting which checklist is active,
// adding a new one, and renaming one. Where `use-checklist-edits.ts` mutates
// the items *inside* the active list, this hook owns the document's
// `checklists[]` array and the device-local "which list am I looking at"
// selection.
//
// Kept as its own concern-scoped hook (like the edit verbs and the
// persistence engine) so a new list-management feature lands here rather
// than swelling the central `use-checklist.ts` composer. The persistence
// engine (`setDoc` / `scheduleSave`) and the undo timeline (`record`) are
// threaded in; the active-selection state lives here in memory — it is a
// property of this view, not of the persisted document, so a reload simply
// falls back to the first list.

import { useCallback, useMemo, useState } from "react";
import type { MutableRefObject } from "react";

import { unlock } from "../achievements/bus.ts";
import {
  createChecklist,
  nextChecklistName,
  progress,
  renameChecklist as renameChecklistOp,
} from "../domain/checklists.ts";
import type { Checklist, Snapshot } from "../domain/types.ts";
import type { TFunction } from "../i18n";
import type { Notify } from "./notify.ts";
import { DEFAULT_LIST_NAME } from "./use-checklist-sync.ts";
import { newId, now } from "./side-effects.ts";

/** A lightweight summary of one checklist, for the side-menu switcher. */
export interface ChecklistSummary {
  id: string;
  name: string;
  /** Active (non-archived) items still unchecked — the switcher's badge. */
  remaining: number;
}

export interface ChecklistLists {
  /** The checklist the views currently render and the edit verbs mutate. */
  activeList: Checklist;
  /** The id of {@link activeList}. */
  activeChecklistId: string;
  /** Every checklist in the document, in document order. */
  checklists: ChecklistSummary[];
  /** Make a checklist active (the side-menu switcher). */
  selectChecklist: (id: string) => void;
  /** Append a fresh, default-named checklist and switch to it. */
  addChecklist: () => void;
  /** Rename a checklist (the clickable header title). */
  renameChecklist: (id: string, name: string) => void;
  /**
   * Remove a checklist from the document. A no-op for the last remaining
   * list (the views always need one to show). Recoverable via undo —
   * `commit` records the whole document on the timeline.
   */
  removeChecklist: (id: string) => void;
}

export function useChecklistLists(deps: {
  /** The full in-memory document. */
  doc: Snapshot;
  /** Latest document, read when folding a list edit into the snapshot. */
  docRef: MutableRefObject<Snapshot>;
  /** Swap the visible document for an immediate re-render. */
  setDoc: (next: Snapshot) => void;
  /** Persist the edited document (debounced by the active backend). */
  scheduleSave: (next: Snapshot) => void;
  /** Record the post-edit document — tagged with its action label — on the undo timeline. */
  record: (next: Snapshot, label: string) => void;
  /** Raise a toast for an action whose result the user can't immediately see. */
  notify: Notify;
  /** Translator for the action labels (also reused as the toast text). */
  t: TFunction;
}): ChecklistLists {
  const { doc, docRef, setDoc, scheduleSave, record, notify, t } = deps;

  // Which list the user is looking at. Device-local and in-memory: a
  // selection that points at no surviving list (after a reload or a backend
  // swap brought in a different document) silently falls back to the first.
  const [activeId, setActiveId] = useState<string | null>(null);

  // The sync engine guarantees the document always has at least one list
  // (`withActiveList`), so `[0]` is a safe fallback for an unknown selection.
  const activeList =
    doc.checklists.find((c) => c.id === activeId) ?? doc.checklists[0]!;

  const commit = useCallback(
    (next: Snapshot, label: string) => {
      setDoc(next);
      scheduleSave(next);
      record(next, label);
    },
    [setDoc, scheduleSave, record],
  );

  const selectChecklist = useCallback((id: string) => setActiveId(id), []);

  const addChecklist = useCallback(() => {
    const prev = docRef.current;
    const created = createChecklist(
      newId(),
      nextChecklistName(prev.checklists, DEFAULT_LIST_NAME),
      now(),
    );
    // No toast: the switcher jumps to the fresh, visibly-empty list.
    commit(
      { ...prev, checklists: [...prev.checklists, created] },
      t("toast.listCreated", { name: created.name }),
    );
    setActiveId(created.id);
  }, [docRef, commit, t]);

  const renameChecklist = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const prev = docRef.current;
      unlock("renamed");
      // No toast: the header title updates in place.
      commit(
        {
          ...prev,
          checklists: prev.checklists.map((c) =>
            c.id === id ? renameChecklistOp(c, trimmed, now()) : c,
          ),
        },
        t("toast.listRenamed", { name: trimmed }),
      );
    },
    [docRef, commit, t],
  );

  const removeChecklist = useCallback(
    (id: string) => {
      const prev = docRef.current;
      // The document must always carry at least one list — `activeList`
      // falls back to `checklists[0]`, so dropping the last one would blank
      // the screen. Refuse it (the side menu also hides the affordance).
      if (prev.checklists.length <= 1) return;
      const remaining = prev.checklists.filter((c) => c.id !== id);
      if (remaining.length === prev.checklists.length) return;
      const name = prev.checklists.find((c) => c.id === id)?.name ?? "";
      const label = t("toast.listDeleted", { name });
      commit({ ...prev, checklists: remaining }, label);
      notify(label);
      unlock("cleanSlate");
      // Removing the explicitly-selected list re-points the selection at the
      // first survivor; an unset selection already falls back to `[0]`.
      if (id === activeId) setActiveId(remaining[0]!.id);
    },
    [docRef, commit, notify, t, activeId],
  );

  const checklists = useMemo(
    () =>
      doc.checklists.map((c) => {
        const { checked, total } = progress(c);
        return { id: c.id, name: c.name, remaining: total - checked };
      }),
    [doc.checklists],
  );

  return useMemo(
    () => ({
      activeList,
      activeChecklistId: activeList.id,
      checklists,
      selectChecklist,
      addChecklist,
      renameChecklist,
      removeChecklist,
    }),
    [
      activeList,
      checklists,
      selectChecklist,
      addChecklist,
      renameChecklist,
      removeChecklist,
    ],
  );
}
