// Top-level app state, as a hook. The one place that wires the pure
// domain operations to a concrete StorageAdapter and supplies the
// side-effects (id generation, clock) the domain functions deliberately
// avoid — the React counterpart of the budget project's storage hooks.
//
// The view works against a single active checklist (the simple list the
// user sees). This hook is a thin composer of three concern-scoped pieces:
// the persistence engine (`useChecklistSync` — debounced saves, conflict
// state, load/reload), the undo timeline (`useUndoRedo`), and the edit
// verbs (`useChecklistEdits`). It owns only the selectors over the active
// list and the memoized public surface the views consume.

import { useCallback, useMemo, useRef, useState } from "react";

import { unlock } from "../achievements/bus.ts";
import {
  type ArchivedGroup,
  archivedByChecklist,
  displayItems,
} from "../domain/checklists.ts";
import type { ChecklistItem, Snapshot } from "../domain/types.ts";
import { useT } from "../i18n";
import type { AddItemPosition } from "../settings/types.ts";
import { type StorageAdapter } from "../storage/adapter.ts";
import { BrowserLocalStorageAdapter } from "../storage/local/index.ts";
import { type Notify, noopNotify } from "./notify.ts";
import {
  type ChecklistEdits,
  useChecklistEdits,
} from "./use-checklist-edits.ts";
import {
  type ChecklistLists,
  type ChecklistSummary,
  useChecklistLists,
} from "./use-checklist-lists.ts";
import {
  type ConflictState,
  type SaveStatus,
  useChecklistSync,
} from "./use-checklist-sync.ts";
import { useUndoRedo } from "./use-undo-redo.ts";

// Re-exported from the persistence engine so consumers (SyncStatus, the
// checklist context, the conflict modal) keep importing the save-state
// types from the hook's barrel.
export type { ChecklistSummary, ConflictState, SaveStatus };

export interface UseChecklist extends ChecklistEdits, ChecklistLists {
  /** The full in-memory document (used by the conflict summary). */
  snapshot: Snapshot;
  /** The active checklist's visible (non-archived) items. */
  items: ChecklistItem[];
  /**
   * Archived items across every checklist, grouped by their source list —
   * what the archive view lists under a per-checklist header. Lists with
   * nothing archived are omitted.
   */
  archivedGroups: ArchivedGroup[];
  /** How many visible items are checked. */
  checkedCount: number;
  /**
   * Re-read the document from the active backend, replacing what's on
   * screen — the pull-to-refresh action. A no-op-ish round trip for
   * localStorage, but the honest "pick up another device's edit" pull
   * for the cloud backends (Google Drive / Dropbox).
   */
  reload: () => Promise<void>;
  /** Set when a save collided with a newer remote revision; else null. */
  conflict: ConflictState | null;
  /** Resolve an open conflict by keeping this device's copy or the remote's. */
  resolveConflict: (keep: "local" | "remote") => void;
  /** Coarse state of the last save, for the cloud-sync status glyph. */
  status: SaveStatus;
  /** Why the last save failed (set only while `status === "error"`). */
  statusDetail: string | null;
  /** Whether there are local edits not yet persisted to the backend. */
  dirty: boolean;
  /**
   * True when the active (cloud) backend is unreachable and the document on
   * screen is the on-device cache — the user is editing a local copy that
   * re-syncs when the network returns. Always false for the local backends.
   */
  offline: boolean;
  /** False until the backend's first load resolves — gates the achievement watcher. */
  loaded: boolean;
  /** Flush any debounced save immediately (the "save now" affordance). */
  saveNow: () => void;
  /** Revert the last edit, restoring the prior document (incl. deletions). */
  undo: () => void;
  /** Re-apply the most recently undone edit. */
  redo: () => void;
  /** Whether there is a prior edit to revert. */
  canUndo: boolean;
  /** Whether there is an undone edit to re-apply. */
  canRedo: boolean;
}

export function useChecklist(
  adapter?: StorageAdapter,
  addItemPosition: AddItemPosition = "bottom",
  notify: Notify = noopNotify,
  sortCheckedToBottom = false,
): UseChecklist {
  const t = useT();

  // A stable fallback for callers (and tests) that don't pass an adapter.
  // App always passes a memoized one, so the swap effect inside the sync
  // engine only fires on a real backend change (e.g. the developer
  // fake-data toggle).
  const [fallback] = useState(() => new BrowserLocalStorageAdapter());
  const active: StorageAdapter = adapter ?? fallback;

  // The undo timeline is constructed after the sync engine (it needs the
  // engine's `setDoc` / `scheduleSave` to apply an undone snapshot), but
  // the engine's load / reload / conflict-adopt paths need to reset that
  // timeline. Break the cycle with a ref the engine reads and the timeline
  // fills once it exists.
  const resetHistory = useRef<(seed: Snapshot) => void>(() => {});

  const { doc, docRef, setDoc, scheduleSave, ...sync } = useChecklistSync({
    active,
    resetHistory,
  });

  // Apply a snapshot picked off the undo / redo timeline: swap the visible
  // document and persist it so the reverted state survives a reload,
  // exactly as a normal edit would.
  const applyHistorySnapshot = useCallback(
    (next: Snapshot) => {
      setDoc(next);
      scheduleSave(next);
    },
    [setDoc, scheduleSave],
  );

  const {
    record,
    reset,
    undo: undoTimeline,
    redo: redoTimeline,
    canUndo,
    canRedo,
  } = useUndoRedo({
    initialSeed: doc,
    setData: applyHistorySnapshot,
  });
  resetHistory.current = reset;

  // Undo / redo walk the timeline and announce the action they stepped
  // past — the document swaps under the user, so the toast is what tells
  // them *what* just came back (or went away again).
  const undo = useCallback(() => {
    const label = undoTimeline();
    if (label) {
      unlock("secondThoughts");
      notify(t("toast.undone", { action: label }));
    }
  }, [undoTimeline, notify, t]);

  const redo = useCallback(() => {
    const label = redoTimeline();
    if (label) notify(t("toast.redone", { action: label }));
  }, [redoTimeline, notify, t]);

  // The checklist-collection verbs (select / add / rename) and the active
  // selection. The active list it resolves is what the edit verbs below
  // mutate and what the views render.
  const lists = useChecklistLists({
    doc,
    docRef,
    setDoc,
    scheduleSave,
    record,
    notify,
    t,
  });
  const list = lists.activeList;

  // The edit verbs (add / toggle / remove / archive / unarchive / reorder)
  // live in their own concern-scoped hook so a new action lands there
  // rather than this central hook. The persistence engine (`setDoc` /
  // `scheduleSave`) and the undo timeline (`record`) are threaded in.
  const edits = useChecklistEdits({
    list,
    docRef,
    setDoc,
    scheduleSave,
    record,
    notify,
    t,
    addItemPosition,
    sortCheckedToBottom,
  });

  const items = useMemo(
    () => displayItems(list, sortCheckedToBottom),
    [list, sortCheckedToBottom],
  );
  // The archive spans every checklist, so it derives from the whole document
  // rather than the active list — restoring or deleting reaches into whatever
  // list the item came from (see `useChecklistEdits`).
  const archivedGroups = useMemo(() => archivedByChecklist(doc), [doc]);
  const checkedCount = useMemo(
    () => items.filter((it) => it.checked).length,
    [items],
  );

  // Memoized so the returned object keeps a stable identity across renders
  // that don't touch the checklist (e.g. an appearance-settings change in
  // App). App wraps this value straight into `ChecklistContext`, and the
  // memoized views consuming it only re-render when one of these fields
  // actually changes — not on every settings drag.
  return useMemo(
    () => ({
      snapshot: doc,
      items,
      archivedGroups,
      checkedCount,
      ...lists,
      ...edits,
      reload: sync.reload,
      conflict: sync.conflict,
      resolveConflict: sync.resolveConflict,
      status: sync.status,
      statusDetail: sync.statusDetail,
      dirty: sync.dirty,
      offline: sync.offline,
      loaded: sync.loaded,
      saveNow: sync.saveNow,
      undo,
      redo,
      canUndo,
      canRedo,
    }),
    [
      doc,
      items,
      archivedGroups,
      checkedCount,
      lists,
      edits,
      sync.reload,
      sync.conflict,
      sync.resolveConflict,
      sync.status,
      sync.statusDetail,
      sync.dirty,
      sync.offline,
      sync.loaded,
      sync.saveNow,
      undo,
      redo,
      canUndo,
      canRedo,
    ],
  );
}
