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

import { unlock } from "../achievements/bus.ts";
import {
  addItem as addItemOp,
  addItems as addItemsOp,
  archiveChecked as archiveCheckedOp,
  deleteChecked as deleteCheckedOp,
  deleteItem as deleteItemOp,
  editItem as editItemOp,
  moveDisplayedItem as moveDisplayedItemOp,
  setArchived,
  toggleItem as toggleItemOp,
} from "../domain/checklists.ts";
import type { Checklist, ChecklistItem, Snapshot } from "../domain/types.ts";
import type { TFunction } from "../i18n";
import type { AddItemPosition } from "../settings/types.ts";
import { parseItemsFromMarkdown } from "../storage/markdown/codec.ts";
import type { Notify } from "./notify.ts";
import { newId, now } from "./side-effects.ts";

export interface ChecklistEdits {
  /**
   * Add an item to the active list. Returns the new item's id so a caller
   * can act on the freshly-created row — the composer uses it to jump
   * straight into editing the new item's body (Shift+Enter). Returns null
   * when the title was blank, so nothing was added.
   */
  addItem: (title: string) => string | null;
  /**
   * Import a pasted markdown checklist as fresh items appended to the
   * active list (existing items are kept). Returns how many items were
   * added — zero when the text held no task/bullet lines, which the
   * composer uses to tell a checklist paste from ordinary text.
   */
  importItems: (markdown: string) => number;
  /**
   * Edit an existing item's text in place — its `title`, its `notes` body,
   * or both. Only the fields supplied are touched; an empty `notes` clears
   * the body. A no-op edit is dropped without writing.
   */
  editItem: (
    itemId: string,
    fields: { title?: string; notes?: string },
  ) => void;
  toggle: (itemId: string) => void;
  remove: (itemId: string) => void;
  /**
   * Delete an item that the user has emptied out — title (and body) erased —
   * by blurring the editor or by backspacing past the start of an empty
   * line. Silent (no toast), since the row simply vanishes where the user is
   * looking; the step is still recorded so undo can resurrect it.
   */
  removeEmpty: (itemId: string) => void;
  archive: (itemId: string) => void;
  /**
   * Archive every finished (checked) item in the active list in one sweep —
   * the bulk action behind the add-button's long-press menu.
   */
  archiveFinished: () => void;
  /**
   * Permanently delete every finished (checked) item in the active list in
   * one sweep — the destructive bulk action behind the long-press menu.
   */
  deleteFinished: () => void;
  /** Restore an archived item back into the list it came from. */
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
  /**
   * Whether checked items are sorted to the bottom of the view. Reorder reads
   * it so a drop index is interpreted against the displayed order, not the
   * raw document order.
   */
  sortCheckedToBottom: boolean;
}): ChecklistEdits {
  const { list, docRef, setDoc, scheduleSave, record, notify, t } = deps;
  const { addItemPosition, sortCheckedToBottom } = deps;

  // Read the live preferences from refs so `addItem` / `reorder` stay
  // referentially stable (App memoizes the view on them) even as the
  // settings change.
  const addItemPositionRef = useRef(addItemPosition);
  addItemPositionRef.current = addItemPosition;
  const sortCheckedToBottomRef = useRef(sortCheckedToBottom);
  sortCheckedToBottomRef.current = sortCheckedToBottom;

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

  // Locate an item by id anywhere in the document, returning it with its
  // owning checklist. The archive spans every list, so restore and delete
  // resolve the owner from the whole snapshot rather than the active list —
  // an archived item may belong to a checklist the user isn't looking at.
  const findItem = useCallback(
    (itemId: string) => {
      for (const checklist of docRef.current.checklists) {
        const item = checklist.items.find((it) => it.id === itemId);
        if (item) return { checklist, item };
      }
      return null;
    },
    [docRef],
  );

  const addItem = useCallback(
    (title: string): string | null => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const id = newId();
      // No toast: the new row appears in place, so the result is visible.
      commit(
        addItemOp(
          listRef.current,
          { id, title: trimmed },
          now(),
          addItemPositionRef.current,
        ),
        t("toast.itemAdded", { title: trimmed }),
      );
      return id;
    },
    [commit, t],
  );

  const importItems = useCallback(
    (markdown: string): number => {
      const parsed = parseItemsFromMarkdown(markdown);
      if (parsed.length === 0) return 0;
      const items: ChecklistItem[] = parsed.map((raw) => {
        const item: ChecklistItem = {
          id: newId(),
          title: raw.title,
          checked: raw.checked,
        };
        if (raw.required) item.required = true;
        if (raw.notes) item.notes = raw.notes;
        return item;
      });
      const label = t("toast.itemsImported", { count: items.length });
      commit(addItemsOp(listRef.current, items, now()), label);
      notify(label, "success");
      unlock("pasteList");
      return items.length;
    },
    [commit, notify, t],
  );

  const editItem = useCallback(
    (itemId: string, fields: { title?: string; notes?: string }) => {
      const before = listRef.current.items.find((it) => it.id === itemId);
      if (!before) return;
      const next = editItemOp(listRef.current, itemId, fields, now());
      // A no-op edit returns the same list — nothing changed, so don't
      // write or record an empty step on the undo timeline.
      if (next === listRef.current) return;
      const title =
        next.items.find((it) => it.id === itemId)?.title ?? before.title;
      // No toast: the edited row updates in place. The label still feeds undo.
      commit(next, t("toast.itemEdited", { title }));
      // Renaming an item's headline is the "Wordsmith" trophy; adding a note
      // body unlocks "Note to Self" through its derived predicate.
      if (
        fields.title !== undefined &&
        fields.title.trim() &&
        fields.title.trim() !== before.title
      ) {
        unlock("wordsmith");
      }
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
      const found = findItem(itemId);
      if (!found) return;
      const label = t("toast.itemDeleted", { title: found.item.title });
      commit(deleteItemOp(found.checklist, itemId, now()), label);
      notify(label);
    },
    [commit, findItem, notify, t],
  );

  const removeEmpty = useCallback(
    (itemId: string) => {
      const found = findItem(itemId);
      if (!found) return;
      // No toast: the emptied row disappears in place under the user's
      // cursor. The undo step still carries a label so it can be walked back.
      commit(
        deleteItemOp(found.checklist, itemId, now()),
        t("toast.emptyItemRemoved"),
      );
    },
    [commit, findItem, t],
  );

  const archive = useCallback(
    (itemId: string) => {
      const label = t("toast.itemArchived", { title: titleOf(itemId) });
      commit(setArchived(listRef.current, itemId, true, now()), label);
      notify(label);
    },
    [commit, notify, titleOf, t],
  );

  // Count the finished (checked, still-active) items the bulk verbs act on,
  // so they can no-op silently when there's nothing to sweep and feed the
  // count into the toast otherwise.
  const finishedCount = useCallback(
    () =>
      listRef.current.items.filter((it) => it.checked && !it.archived).length,
    [],
  );

  const archiveFinished = useCallback(() => {
    const count = finishedCount();
    if (count === 0) return;
    const label = t("toast.itemsArchived", { count });
    commit(archiveCheckedOp(listRef.current, now()), label);
    notify(label);
    unlock("springClean");
  }, [commit, finishedCount, notify, t]);

  const deleteFinished = useCallback(() => {
    const count = finishedCount();
    if (count === 0) return;
    const label = t("toast.itemsDeleted", { count });
    commit(deleteCheckedOp(listRef.current, now()), label);
    notify(label);
    unlock("cleanSweep");
  }, [commit, finishedCount, notify, t]);

  const unarchive = useCallback(
    (itemId: string) => {
      const found = findItem(itemId);
      if (!found) return;
      const label = t("toast.itemRestored", { title: found.item.title });
      commit(setArchived(found.checklist, itemId, false, now()), label);
      notify(label, "success");
      unlock("comeback");
    },
    [commit, findItem, notify, t],
  );

  const reorder = useCallback(
    (itemId: string, toIndex: number) => {
      // No toast: the row visibly lands at its new spot. Label feeds undo.
      // `toIndex` is an index into the *displayed* order, which differs from
      // document order while checked items are sunk to the bottom.
      commit(
        moveDisplayedItemOp(
          listRef.current,
          itemId,
          toIndex,
          sortCheckedToBottomRef.current,
          now(),
        ),
        t("toast.itemMoved", { title: titleOf(itemId) }),
      );
      unlock("reshuffle");
    },
    [commit, titleOf, t],
  );

  return useMemo(
    () => ({
      addItem,
      importItems,
      editItem,
      toggle,
      remove,
      removeEmpty,
      archive,
      archiveFinished,
      deleteFinished,
      unarchive,
      reorder,
      addItemPosition,
    }),
    [
      addItem,
      importItems,
      editItem,
      toggle,
      remove,
      removeEmpty,
      archive,
      archiveFinished,
      deleteFinished,
      unarchive,
      reorder,
      addItemPosition,
    ],
  );
}
