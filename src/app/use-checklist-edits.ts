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
  addItemAfter as addItemAfterOp,
  addItems as addItemsOp,
  addItemsAfter as addItemsAfterOp,
  archiveChecked as archiveCheckedOp,
  deleteChecked as deleteCheckedOp,
  deleteItem as deleteItemOp,
  editItem as editItemOp,
  findItem,
  flattenItems,
  moveItemInto as moveItemIntoOp,
  setAllChecked as setAllCheckedOp,
  setArchived,
  setItemDeadline as setItemDeadlineOp,
  toggleItem as toggleItemOp,
  type DropMode,
} from "../domain/checklists.ts";
import type {
  Checklist,
  ChecklistItem,
  Recurrence,
  Snapshot,
} from "../domain/types.ts";
import type { TFunction } from "../i18n";
import type { AddItemPosition } from "../settings/types.ts";
import {
  type ImportedItem,
  parseItemsFromMarkdown,
} from "../storage/markdown/codec.ts";
import type { Notify } from "./notify.ts";
import { newId, now } from "./side-effects.ts";

// Rebuild a parsed markdown checklist into fresh `ChecklistItem`s, minting an
// id per node so a pasted nested list lands as nested sub-items. Shared by the
// "append" and "insert after a row" import paths so they never drift.
function buildImportedItems(parsed: readonly ImportedItem[]): ChecklistItem[] {
  const toItem = (raw: ImportedItem): ChecklistItem => {
    const item: ChecklistItem = {
      id: newId(),
      title: raw.title,
      checked: raw.checked,
    };
    if (raw.required) item.required = true;
    if (raw.notes) item.notes = raw.notes;
    if (raw.children && raw.children.length > 0) {
      item.children = raw.children.map(toItem);
    }
    return item;
  };
  return parsed.map(toItem);
}

export interface ChecklistEdits {
  /**
   * Add an item to the active list. Returns the new item's id so a caller
   * can act on the freshly-created row — the composer uses it to jump
   * straight into editing the new item's body (Shift+Enter). Returns null
   * when the title was blank, so nothing was added. Pass `parentId` to nest
   * the new item as a sub-item of an existing one (the in-row "add sub-item"
   * composer) instead of adding it at the top level.
   */
  addItem: (title: string, parentId?: string) => string | null;
  /**
   * Add an item immediately after the sibling `afterId` — the
   * "press a row, hit Enter, keep adding right there" flow that drops new
   * items directly under the one just edited rather than at the top or
   * bottom. The new item lands at `afterId`'s own depth. Returns the new
   * id (so the composer can chain the next add below it), or null for a
   * blank title.
   */
  addItemAfter: (title: string, afterId: string) => string | null;
  /**
   * Import a pasted markdown checklist as fresh items appended to the
   * active list (existing items are kept). Returns how many items were
   * added — zero when the text held no task/bullet lines, which the
   * composer uses to tell a checklist paste from ordinary text. Pass
   * `parentId` to append the imported items under an existing item (a paste
   * into the in-row sub-item composer).
   */
  importItems: (markdown: string, parentId?: string) => number;
  /**
   * Import a pasted markdown checklist as fresh items inserted immediately
   * after the sibling `afterId` — the paste counterpart of `addItemAfter`,
   * used by the composer opened below an edited row. Returns the number of
   * items added (zero when the text wasn't a checklist) alongside the id of
   * the last item inserted, so the composer can chain the next add below the
   * pasted block.
   */
  importItemsAfter: (
    markdown: string,
    afterId: string,
  ) => { count: number; lastId: string | null };
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
  /**
   * Toggle an item in a specific list by id — the write-back path for the
   * interactive check-off widget, whose queued taps may target a list other
   * than the active one. A no-op when the list or item no longer exists.
   */
  toggleItemInList: (listId: string, itemId: string) => void;
  /**
   * Set or clear an item's due date and how it repeats — the clock
   * affordance on a swiped-open row. Pass a `YYYY-MM-DD` date (with an
   * optional `recurrence`) to schedule it, or `null` / `null` to clear the
   * deadline (which drops any recurrence with it). A no-op leaves the list
   * untouched.
   */
  setDeadline: (
    itemId: string,
    deadline: string | null,
    recurrence: Recurrence | null,
  ) => void;
  /**
   * Check every active (non-archived) item in one sweep — the "Check all"
   * action in the header count's dropdown. A no-op (everything already
   * checked) leaves the list untouched.
   */
  checkAll: () => void;
  /**
   * Uncheck every active item in one sweep — the "Uncheck all" action in the
   * header count's dropdown. A no-op (nothing checked) leaves it untouched.
   */
  uncheckAll: () => void;
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
  /**
   * Move a dragged item relative to the item it was dropped on: `"into"`
   * nests it as a sub-item, `"before"` / `"after"` drop it as a sibling on
   * that side. Reordering and nesting are the same gesture.
   */
  reorder: (itemId: string, targetId: string, mode: DropMode) => void;
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

  // Read the live add-item position from a ref so `addItem` stays
  // referentially stable (App memoizes the view on it) even as the setting
  // changes. The drop-onto reorder places items relative to a stable target
  // id, so it doesn't need to read the checked-sort setting at all.
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
  // back to empty so a label is still well-formed if the id has gone. Walks
  // the tree, so a sub-item resolves too.
  const titleOf = useCallback(
    (itemId: string) => findItem(listRef.current.items, itemId)?.title ?? "",
    [],
  );

  // Locate an item by id anywhere in the document, returning it with its
  // owning checklist. The archive spans every list, so restore and delete
  // resolve the owner from the whole snapshot rather than the active list —
  // an archived item may belong to a checklist the user isn't looking at. The
  // search walks each list's tree so a nested sub-item is found too.
  const findOwner = useCallback(
    (itemId: string) => {
      for (const checklist of docRef.current.checklists) {
        const item = findItem(checklist.items, itemId);
        if (item) return { checklist, item };
      }
      return null;
    },
    [docRef],
  );

  const addItem = useCallback(
    (title: string, parentId?: string): string | null => {
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
          parentId,
        ),
        t("toast.itemAdded", { title: trimmed }),
      );
      // Adding a sub-item builds the tree the same way the drag-to-nest
      // gesture does, so it earns the same "Nest Egg" trophy.
      if (parentId) unlock("nestEgg");
      return id;
    },
    [commit, t],
  );

  const addItemAfter = useCallback(
    (title: string, afterId: string): string | null => {
      const trimmed = title.trim();
      if (!trimmed) return null;
      const id = newId();
      // No toast: the new row appears in place, right below the edited one.
      commit(
        addItemAfterOp(listRef.current, { id, title: trimmed }, afterId, now()),
        t("toast.itemAdded", { title: trimmed }),
      );
      return id;
    },
    [commit, t],
  );

  const importItems = useCallback(
    (markdown: string, parentId?: string): number => {
      const parsed = parseItemsFromMarkdown(markdown);
      if (parsed.length === 0) return 0;
      const items = buildImportedItems(parsed);
      const count = flattenItems(items).length;
      const label = t("toast.itemsImported", { count });
      commit(addItemsOp(listRef.current, items, now(), parentId), label);
      notify(label, "success");
      unlock("pasteList");
      if (parentId) unlock("nestEgg");
      return count;
    },
    [commit, notify, t],
  );

  const importItemsAfter = useCallback(
    (
      markdown: string,
      afterId: string,
    ): { count: number; lastId: string | null } => {
      const parsed = parseItemsFromMarkdown(markdown);
      if (parsed.length === 0) return { count: 0, lastId: null };
      const items = buildImportedItems(parsed);
      const count = flattenItems(items).length;
      const label = t("toast.itemsImported", { count });
      commit(addItemsAfterOp(listRef.current, items, afterId, now()), label);
      notify(label, "success");
      unlock("pasteList");
      // The last top-level item is the new anchor, so the composer's next
      // add chains below the pasted block instead of above it.
      return { count, lastId: items[items.length - 1]!.id };
    },
    [commit, notify, t],
  );

  const editItem = useCallback(
    (itemId: string, fields: { title?: string; notes?: string }) => {
      const before = findItem(listRef.current.items, itemId);
      if (!before) return;
      const next = editItemOp(listRef.current, itemId, fields, now());
      // A no-op edit returns the same list — nothing changed, so don't
      // write or record an empty step on the undo timeline.
      if (next === listRef.current) return;
      const title = findItem(next.items, itemId)?.title ?? before.title;
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
      const target = findItem(listRef.current.items, itemId);
      const willCheck = !target?.checked;
      // A recurring item isn't checked off — it rolls forward to its next due
      // date (see `toggleItem`), so it earns its own label rather than the
      // "Checked" one, which would read wrong for a row that stays unchecked.
      const reschedules = Boolean(
        willCheck && target?.recurrence && target?.deadline,
      );
      const label = reschedules
        ? t("toast.itemRescheduled", { title })
        : t(willCheck ? "toast.itemChecked" : "toast.itemUnchecked", { title });
      // No toast: the checkbox flips (or the date rolls) in place. The label
      // still feeds undo.
      commit(toggleItemOp(listRef.current, itemId, now()), label);
    },
    [commit, titleOf, t],
  );

  // Toggle an item in a named list — not necessarily the active one. The
  // interactive check-off widget queues `{ listId, itemId }` actions the app
  // drains and replays here, so the write lands in whatever list the widget
  // showed and flows through the same `commit` path (save + undo) as a normal
  // tap rather than a second store path. A no-op when the list or item has
  // since gone (a stale queued action).
  const toggleItemInList = useCallback(
    (listId: string, itemId: string) => {
      const target = docRef.current.checklists.find((c) => c.id === listId);
      if (!target) return;
      const item = findItem(target.items, itemId);
      if (!item) return;
      const next = toggleItemOp(target, itemId, now());
      if (next === target) return;
      const label = t(
        item.checked ? "toast.itemUnchecked" : "toast.itemChecked",
        {
          title: item.title,
        },
      );
      commit(next, label);
    },
    [commit, docRef, t],
  );

  const setDeadline = useCallback(
    (
      itemId: string,
      deadline: string | null,
      recurrence: Recurrence | null,
    ) => {
      const found = findOwner(itemId);
      if (!found) return;
      const next = setItemDeadlineOp(
        found.checklist,
        itemId,
        deadline,
        recurrence,
        now(),
      );
      // A no-op (the same date already set, or clearing an undated item)
      // returns the same list — skip the write and the undo step.
      if (next === found.checklist) return;
      const label = deadline
        ? t("toast.deadlineSet", { title: found.item.title })
        : t("toast.deadlineCleared", { title: found.item.title });
      commit(next, label);
      notify(label);
    },
    [commit, findOwner, notify, t],
  );

  const checkAll = useCallback(() => {
    const next = setAllCheckedOp(listRef.current, true, now());
    // Nothing to do (every item already checked) — skip the write and the
    // undo step so the gesture leaves no trace.
    if (next === listRef.current) return;
    const label = t("toast.allChecked");
    commit(next, label);
    notify(label, "success");
    unlock("allIn");
  }, [commit, notify, t]);

  const uncheckAll = useCallback(() => {
    const next = setAllCheckedOp(listRef.current, false, now());
    if (next === listRef.current) return;
    const label = t("toast.allUnchecked");
    commit(next, label);
    notify(label);
  }, [commit, notify, t]);

  const remove = useCallback(
    (itemId: string) => {
      const found = findOwner(itemId);
      if (!found) return;
      const label = t("toast.itemDeleted", { title: found.item.title });
      commit(deleteItemOp(found.checklist, itemId, now()), label);
      notify(label);
    },
    [commit, findOwner, notify, t],
  );

  const removeEmpty = useCallback(
    (itemId: string) => {
      const found = findOwner(itemId);
      if (!found) return;
      // No toast: the emptied row disappears in place under the user's
      // cursor. The undo step still carries a label so it can be walked back.
      commit(
        deleteItemOp(found.checklist, itemId, now()),
        t("toast.emptyItemRemoved"),
      );
    },
    [commit, findOwner, t],
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
  // count into the toast otherwise. Walks the tree, so finished sub-items
  // count toward the sweep.
  const finishedCount = useCallback(
    () =>
      flattenItems(listRef.current.items).filter(
        (it) => it.checked && !it.archived,
      ).length,
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
      const found = findOwner(itemId);
      if (!found) return;
      const label = t("toast.itemRestored", { title: found.item.title });
      commit(setArchived(found.checklist, itemId, false, now()), label);
      notify(label, "success");
      unlock("comeback");
    },
    [commit, findOwner, notify, t],
  );

  const reorder = useCallback(
    (itemId: string, targetId: string, mode: DropMode) => {
      const next = moveItemIntoOp(
        listRef.current,
        itemId,
        targetId,
        mode,
        now(),
      );
      // Dropping onto itself or its own descendant is a no-op — skip the
      // write and the undo step so the gesture leaves no trace.
      if (next === listRef.current) return;
      // No toast: the row visibly lands at its new spot. Label feeds undo.
      commit(next, t("toast.itemMoved", { title: titleOf(itemId) }));
      // Nesting an item under another (the drop-into gesture) is its own
      // trophy; a plain sibling reorder keeps the Reshuffle one.
      if (mode === "into") unlock("nestEgg");
      else unlock("reshuffle");
    },
    [commit, titleOf, t],
  );

  return useMemo(
    () => ({
      addItem,
      addItemAfter,
      importItems,
      importItemsAfter,
      editItem,
      toggle,
      toggleItemInList,
      setDeadline,
      checkAll,
      uncheckAll,
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
      addItemAfter,
      importItems,
      importItemsAfter,
      editItem,
      toggle,
      toggleItemInList,
      setDeadline,
      checkAll,
      uncheckAll,
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
