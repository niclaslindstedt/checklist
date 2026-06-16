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
import type { AddItemPosition } from "../settings/types.ts";
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
  /** Record the post-edit document on the undo timeline. */
  record: (next: Snapshot) => void;
  /** Where `addItem` inserts a new item ("top" or "bottom"). */
  addItemPosition: AddItemPosition;
}): ChecklistEdits {
  const { list, docRef, setDoc, scheduleSave, record, addItemPosition } = deps;

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

  const commit = useCallback(
    (nextList: Checklist) => {
      const prev = docRef.current;
      const next: Snapshot = {
        ...prev,
        checklists: prev.checklists.map((c) =>
          c.id === nextList.id ? nextList : c,
        ),
      };
      setDoc(next);
      scheduleSave(next);
      // Snapshot the post-edit document onto the undo timeline. Recording
      // the whole document (not just the diff) is what lets a later undo
      // resurrect a deleted item from the prior entry.
      record(next);
    },
    [docRef, setDoc, scheduleSave, record],
  );

  const addItem = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      commit(
        addItemOp(
          listRef.current,
          { id: newId(), title: trimmed },
          now(),
          addItemPositionRef.current,
        ),
      );
    },
    [commit],
  );

  const toggle = useCallback(
    (itemId: string) => commit(toggleItemOp(listRef.current, itemId, now())),
    [commit],
  );

  const remove = useCallback(
    (itemId: string) => commit(deleteItemOp(listRef.current, itemId, now())),
    [commit],
  );

  const archive = useCallback(
    (itemId: string) =>
      commit(setArchived(listRef.current, itemId, true, now())),
    [commit],
  );

  const unarchive = useCallback(
    (itemId: string) =>
      commit(setArchived(listRef.current, itemId, false, now())),
    [commit],
  );

  const reorder = useCallback(
    (itemId: string, toIndex: number) =>
      commit(moveItemOp(listRef.current, itemId, toIndex, now())),
    [commit],
  );

  return useMemo(
    () => ({ addItem, toggle, remove, archive, unarchive, reorder }),
    [addItem, toggle, remove, archive, unarchive, reorder],
  );
}
