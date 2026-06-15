// Top-level app state, as a hook. The one place that wires the pure
// domain operations to a concrete StorageAdapter and supplies the
// side-effects (id generation, clock) the domain functions deliberately
// avoid — the React counterpart of the budget project's storage hooks,
// kept deliberately small because checklist has no auth, accounts, or
// cloud sync yet.
//
// The view works against a single active checklist (the simple list the
// user sees). Each mutation applies the matching pure domain function,
// updates React state for an immediate re-render, then persists the whole
// document through the adapter.

import { useCallback, useMemo, useRef, useState } from "react";

import {
  activeItems,
  addItem as addItemOp,
  createChecklist,
  deleteItem as deleteItemOp,
  moveItem as moveItemOp,
  setArchived,
  toggleItem as toggleItemOp,
} from "../domain/checklists.ts";
import type { Checklist, ChecklistItem, Snapshot } from "../domain/types.ts";
import type { StorageAdapter } from "../storage/adapter.ts";
import { BrowserLocalStorageAdapter } from "../storage/local/index.ts";
import { parse, serialize } from "../storage/serialize.ts";

const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();
const DEFAULT_LIST_NAME = "Checklist";

export interface UseChecklist {
  /** The active checklist's visible (non-archived) items. */
  items: ChecklistItem[];
  /** How many visible items are checked. */
  checkedCount: number;
  addItem: (title: string) => void;
  toggle: (itemId: string) => void;
  remove: (itemId: string) => void;
  archive: (itemId: string) => void;
  /** Move a visible item to a new position among the active items. */
  reorder: (itemId: string, toIndex: number) => void;
}

// Guarantee the document always has one checklist to render. A freshly
// created default list isn't persisted until the first real edit, so a
// bare reload never writes an empty document.
function withActiveList(snapshot: Snapshot): Snapshot {
  if (snapshot.checklists.length > 0) return snapshot;
  const list = createChecklist(newId(), DEFAULT_LIST_NAME, now());
  return { ...snapshot, checklists: [list] };
}

export function useChecklist(
  adapter: StorageAdapter = new BrowserLocalStorageAdapter(),
): UseChecklist {
  // Adapter and concurrency token survive re-renders; the adapter is
  // built once even when the default argument is used.
  const adapterRef = useRef(adapter);
  const revisionRef = useRef<string | undefined>(undefined);

  // Seed from the adapter's synchronous fast path so the first paint
  // shows stored data instead of a flash of empty list.
  const [doc, setDoc] = useState<Snapshot>(() =>
    withActiveList(parse(adapterRef.current.loadSync?.()?.text)),
  );

  const list: Checklist =
    doc.checklists[0] ?? withActiveList(doc).checklists[0]!;

  const commit = useCallback((nextList: Checklist) => {
    setDoc((prev) => {
      const next: Snapshot = {
        ...prev,
        checklists: prev.checklists.map((c) =>
          c.id === nextList.id ? nextList : c,
        ),
      };
      void adapterRef.current
        .save(serialize(next), revisionRef.current)
        .then((stored) => {
          revisionRef.current = stored.revision;
        });
      return next;
    });
  }, []);

  const addItem = useCallback(
    (title: string) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      commit(addItemOp(list, { id: newId(), title: trimmed }, now()));
    },
    [commit, list],
  );

  const toggle = useCallback(
    (itemId: string) => commit(toggleItemOp(list, itemId, now())),
    [commit, list],
  );

  const remove = useCallback(
    (itemId: string) => commit(deleteItemOp(list, itemId, now())),
    [commit, list],
  );

  const archive = useCallback(
    (itemId: string) => commit(setArchived(list, itemId, true, now())),
    [commit, list],
  );

  const reorder = useCallback(
    (itemId: string, toIndex: number) =>
      commit(moveItemOp(list, itemId, toIndex, now())),
    [commit, list],
  );

  const items = useMemo(() => activeItems(list), [list]);
  const checkedCount = useMemo(
    () => items.filter((it) => it.checked).length,
    [items],
  );

  return { items, checkedCount, addItem, toggle, remove, archive, reorder };
}
