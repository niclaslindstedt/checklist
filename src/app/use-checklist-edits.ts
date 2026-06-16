// The checklist's edit verbs: the user-facing mutations (add / toggle /
// remove / archive / unarchive / reorder) that each apply the matching
// pure domain function, swap React state for an immediate re-render,
// schedule a persist, and record the result on the undo timeline.
//
// Split out of `use-checklist.ts` so a new action lands in this
// concern-scoped file (and its `ChecklistEdits` interface) rather than the
// central hook's return block and interface — the hub edit that made
// parallel feature work collide. The persistence engine (`setDoc` /
// `scheduleSave`) and the undo timeline (`record`) are threaded in; this
// file owns only the edit verbs.

import { useCallback, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

import {
  addItem as addItemOp,
  deleteItem as deleteItemOp,
  moveItem as moveItemOp,
  setArchived,
  toggleItem as toggleItemOp,
} from "../domain/checklists.ts";
import type { Checklist, Snapshot } from "../domain/types.ts";
import type { TFunction } from "../i18n";
import type { AddItemPosition } from "../settings/types.ts";
import type { Notify } from "./notify.ts";
import { newId, now } from "./side-effects.ts";

export interface ChecklistEdits {
  addItem: (title: string) => void;
  toggle: (itemId: string) => void;
  remove: (itemId: string) => void;
  archive: (itemId: string) => void;
  /** Restore an archived item back into the active view. */
  unarchive: (itemId: string) => void;
  /** Move a visible item to a new position among the active items. */
  reorder: (itemId: string, toIndex: number) => void;
  /**
   * Where a new item lands ("top" or "bottom"), surfaced so the view can
   * render the add-item draft row in the same spot the item will appear.
   */
  addItemPosition: AddItemPosition;
}

export function useChecklistEdits(deps: {
  /** The active checklist the verbs mutate. */
  list: Checklist;
  /** Latest full document, read when folding an edit into the snapshot. */
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
  /** Where `addItem` inserts a new item ("top" or "bottom"). */
  addItemPosition: AddItemPosition;
}): ChecklistEdits {
  const { list, docRef, setDoc, scheduleSave, record, notify, t } = deps;
  const { addItemPosition } = deps;

  // Read the live preference from a ref so `addItem` stays referentially
  // stable (App memoizes the view on it) even as the setting changes.
  const addItemPositionRef = useRef(addItemPosition);
  addItemPositionRef.current = addItemPosition;

  // Mirror the active list into a ref so the edit callbacks below can read
  // the latest list without listing it as a dependency. That keeps
  // `toggle` / `remove` / `archive` / … referentially stable across edits —
  // the memoized `ChecklistRow`s only re-render the row that actually
  // changed instead of the whole list on every edit, undo, or redo.
  const listRef = useRef(list);
  listRef.current = list;

  // Fold the edited list back into the document, persist it, and record
  // the result — tagged with `label` — on the undo timeline. Recording the
  // whole document (not just the diff) is what lets a later undo resurrect
  // a deleted item from the prior entry; the label is what lets undo / redo
  // announce *which* edit they walked past.
  const commit = useCallback(
    (nextList: Checklist, label: string) => {
      const prev = docRef.current;
      const next: Snapshot = {
        ...prev,
        checklists: prev.checklists.map((c) =>
          c.id === nextList.id ? nextList : c,
        ),
      };
      setDoc(next);
      scheduleSave(next);
      record(next, label);
    },
    [docRef, setDoc, scheduleSave, record],
  );

  // The title of an item in the active list, for an action label. Falls
  // back to empty so a label is still well-formed if the id has gone.
  const titleOf = useCallback(
    (itemId: string) =>
      listRef.current.items.find((it) => it.id === itemId)?.title ?? "",
    [],
  );

  const addItem = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      // No toast: the new row appears in place, so the result is visible.
      commit(
        addItemOp(
          listRef.current,
          { id: newId(), title: trimmed },
          now(),
          addItemPositionRef.current,
        ),
        t("toast.itemAdded", { title: trimmed }),
      );
    },
    [commit, t],
  );

  const toggle = useCallback(
    (itemId: string) => {
      const title = titleOf(itemId);
      const willCheck = !listRef.current.items.find((it) => it.id === itemId)
        ?.checked;
      // No toast: the checkbox flips in place. The label still feeds undo.
      commit(
        toggleItemOp(listRef.current, itemId, now()),
        t(willCheck ? "toast.itemChecked" : "toast.itemUnchecked", { title }),
      );
    },
    [commit, titleOf, t],
  );

  const remove = useCallback(
    (itemId: string) => {
      const label = t("toast.itemDeleted", { title: titleOf(itemId) });
      commit(deleteItemOp(listRef.current, itemId, now()), label);
      notify(label);
    },
    [commit, notify, titleOf, t],
  );

  const archive = useCallback(
    (itemId: string) => {
      const label = t("toast.itemArchived", { title: titleOf(itemId) });
      commit(setArchived(listRef.current, itemId, true, now()), label);
      notify(label);
    },
    [commit, notify, titleOf, t],
  );

  const unarchive = useCallback(
    (itemId: string) => {
      const label = t("toast.itemRestored", { title: titleOf(itemId) });
      commit(setArchived(listRef.current, itemId, false, now()), label);
      notify(label, "success");
    },
    [commit, notify, titleOf, t],
  );

  const reorder = useCallback(
    (itemId: string, toIndex: number) =>
      // No toast: the row visibly lands at its new spot. Label feeds undo.
      commit(
        moveItemOp(listRef.current, itemId, toIndex, now()),
        t("toast.itemMoved", { title: titleOf(itemId) }),
      ),
    [commit, titleOf, t],
  );

  return useMemo(
    () => ({
      addItem,
      toggle,
      remove,
      archive,
      unarchive,
      reorder,
      addItemPosition,
    }),
    [addItem, toggle, remove, archive, unarchive, reorder, addItemPosition],
  );
}
