// Top-level app state, as a hook. The one place that wires the pure
// domain operations to a concrete StorageAdapter and supplies the
// side-effects (id generation, clock) the domain functions deliberately
// avoid — the React counterpart of the budget project's storage hooks.
//
// The view works against a single active checklist (the simple list the
// user sees). Each mutation applies the matching pure domain function,
// updates React state for an immediate re-render, then persists the whole
// document through the adapter. Saves are debounced by the adapter's
// `saveDebounceMs` so a cloud backend coalesces a burst of edits into one
// network write; a save that loses a race with another device surfaces a
// `ConflictError`, which this hook turns into a resolvable `conflict`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createLogger } from "../dev/logger.ts";
import {
  activeItems,
  archivedItems as archivedItemsOp,
  createChecklist,
} from "../domain/checklists.ts";
import type { Checklist, ChecklistItem, Snapshot } from "../domain/types.ts";
import type { AddItemPosition } from "../settings/types.ts";
import {
  AuthError,
  ConflictError,
  RateLimitError,
  type StorageAdapter,
} from "../storage/adapter.ts";
import { BrowserLocalStorageAdapter } from "../storage/local/index.ts";
import { parse, serialize } from "../storage/serialize.ts";
import { newId, now } from "./side-effects.ts";
import { type ChecklistEdits, useChecklistEdits } from "./use-checklist-edits.ts";
import { useUndoRedo } from "./use-undo-redo.ts";

const log = createLogger("checklist");

const DEFAULT_LIST_NAME = "Checklist";

/** A divergence between the on-screen document and the backend's. */
export type ConflictState = {
  /** The bytes currently on the backend (typically another device's edit). */
  remote: Snapshot;
  /** The remote revision to base a "keep mine" overwrite on. */
  remoteRevision?: string;
};

/**
 * Coarse state of the last save against the active backend, driving the
 * cloud-sync status glyph in the header. A pared-down version of the
 * budget project's `SaveStatus` — the checklist has no offline mirror or
 * parse-error surface, so those states don't apply.
 */
export type SaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "conflict"
  | "auth-error"
  | "throttled";

export interface UseChecklist extends ChecklistEdits {
  /** The full in-memory document (used by the conflict summary). */
  snapshot: Snapshot;
  /** The active checklist's visible (non-archived) items. */
  items: ChecklistItem[];
  /** The active checklist's archived items, for the archive view. */
  archivedItems: ChecklistItem[];
  /** How many visible items are checked. */
  checkedCount: number;
  /**
   * Re-read the document from the active backend, replacing what's on
   * screen — the pull-to-refresh action. A no-op-ish round trip for
   * localStorage, but the honest "pick up another device's edits" pull
   * for the cloud backends (Google Drive / Dropbox).
   */
  reload: () => Promise<void>;
  /** Set when a save collided with a newer remote revision; else null. */
  conflict: ConflictState | null;
  /** Resolve an open conflict by keeping this device's copy or the remote's. */
  resolveConflict: (keep: "local" | "remote") => void;
  /** Coarse state of the last save, for the cloud-sync status glyph. */
  status: SaveStatus;
  /** Whether there are local edits not yet persisted to the backend. */
  dirty: boolean;
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

// Guarantee the document always has one checklist to render. A freshly
// created default list isn't persisted until the first real edit, so a
// bare reload never writes an empty document.
function withActiveList(snapshot: Snapshot): Snapshot {
  if (snapshot.checklists.length > 0) return snapshot;
  const list = createChecklist(newId(), DEFAULT_LIST_NAME, now());
  return { ...snapshot, checklists: [list] };
}

export function useChecklist(
  adapter?: StorageAdapter,
  addItemPosition: AddItemPosition = "bottom",
): UseChecklist {
  // A stable fallback for callers (and tests) that don't pass an adapter.
  // App always passes a memoized one, so the swap effect below only fires
  // on a real backend change (e.g. the developer fake-data toggle).
  const [fallback] = useState(() => new BrowserLocalStorageAdapter());
  const active: StorageAdapter = adapter ?? fallback;

  // Adapter and concurrency token survive re-renders.
  const adapterRef = useRef(active);
  const revisionRef = useRef<string | undefined>(undefined);

  // Seed from the adapter's synchronous fast path so the first paint
  // shows stored data instead of a flash of empty list.
  const [doc, setDoc] = useState<Snapshot>(() =>
    withActiveList(parse(active.loadSync?.()?.text)),
  );
  // Latest doc, readable from async callbacks (debounced save, conflict
  // resolution) without re-subscribing them to every render.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [dirty, setDirty] = useState(false);

  // Debounced-save plumbing. `pendingDoc` holds the latest unsaved
  // document; the timer coalesces a burst of edits into one write per
  // `saveDebounceMs` window (0 ⇒ save immediately, right for localStorage).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDoc = useRef<Snapshot | null>(null);

  const performSave = useCallback((next: Snapshot, baseRevision?: string) => {
    setStatus("saving");
    void adapterRef.current
      .save(serialize(next), baseRevision)
      .then((stored) => {
        revisionRef.current = stored.revision;
        // Another edit may have arrived mid-flight; stay dirty if so.
        if (pendingDoc.current === null) setDirty(false);
        setStatus("saved");
      })
      .catch((err: unknown) => {
        if (err instanceof ConflictError) {
          log.warn("save: remote moved — surfacing conflict");
          setStatus("conflict");
          setConflict({
            remote: withActiveList(parse(err.remote.text)),
            remoteRevision: err.remote.revision,
          });
        } else if (err instanceof AuthError) {
          log.error("save: auth error", err);
          setStatus("auth-error");
        } else if (err instanceof RateLimitError) {
          log.warn("save: rate limited", err);
          setStatus("throttled");
        } else {
          log.error("save failed", err);
          setStatus("error");
        }
      });
  }, []);

  const flushSave = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const next = pendingDoc.current;
    if (next === null) return;
    pendingDoc.current = null;
    performSave(next, revisionRef.current);
  }, [performSave]);

  const scheduleSave = useCallback(
    (next: Snapshot) => {
      pendingDoc.current = next;
      setDirty(true);
      const ms = adapterRef.current.saveDebounceMs ?? 0;
      if (ms <= 0) {
        flushSave();
        return;
      }
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushSave, ms);
    },
    [flushSave],
  );

  // Apply a snapshot picked off the undo / redo timeline: swap the
  // visible document and persist it so the reverted state survives a
  // reload, exactly as a normal edit would.
  const applyHistorySnapshot = useCallback(
    (next: Snapshot) => {
      setDoc(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const { record, reset, undo, redo, canUndo, canRedo } = useUndoRedo({
    initialSeed: doc,
    setData: applyHistorySnapshot,
  });

  // Reload whenever the active adapter instance changes. On first mount
  // this re-confirms the loadSync seed (same bytes, no flicker); on a
  // mid-session swap (fake-data on/off, backend change, encryption
  // unlock) it loads the new backend's document and replaces what's on
  // screen. Any pending save against the old backend is flushed first so
  // an in-flight edit isn't dropped, and the concurrency token resets so
  // the first save against the new backend isn't rejected.
  useEffect(() => {
    flushSave();
    adapterRef.current = active;
    revisionRef.current = undefined;
    setConflict(null);
    setStatus("idle");
    setDirty(false);
    let cancelled = false;
    void active.load().then((stored) => {
      if (cancelled) return;
      revisionRef.current = stored?.revision;
      const loaded = withActiveList(parse(stored?.text));
      setDoc(loaded);
      // The freshly-loaded document is a new baseline — drop the old
      // backend's undo history so "undo" can't jump to a vanished state.
      reset(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [active, flushSave, reset]);

  // Flush any pending save on unmount so a debounced edit isn't lost.
  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  const list: Checklist =
    doc.checklists[0] ?? withActiveList(doc).checklists[0]!;

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
    addItemPosition,
  });

  const reload = useCallback(async () => {
    flushSave();
    const stored = await adapterRef.current.load();
    revisionRef.current = stored?.revision;
    setConflict(null);
    setStatus("idle");
    setDirty(false);
    const reloaded = withActiveList(parse(stored?.text));
    setDoc(reloaded);
    reset(reloaded);
  }, [flushSave, reset]);

  // Push any debounced edit to the backend immediately — the "save now"
  // action on the cloud-sync glyph when there are unsaved changes.
  const saveNow = useCallback(() => {
    flushSave();
  }, [flushSave]);

  const resolveConflict = useCallback(
    (keep: "local" | "remote") => {
      setConflict((current) => {
        if (!current) return null;
        if (keep === "local") {
          // Overwrite the remote: re-save this device's bytes basing the
          // write on the remote revision so the backend accepts it.
          revisionRef.current = current.remoteRevision;
          performSave(docRef.current, current.remoteRevision);
        } else {
          // Adopt the remote bytes as the new in-memory state and stamp
          // its revision so the next edit bases on it — no immediate
          // write-back, so we don't bounce the conflict.
          revisionRef.current = current.remoteRevision;
          setDoc(current.remote);
          // Adopting the remote document makes it the new baseline, so
          // the local edit history no longer applies.
          reset(current.remote);
          setDirty(false);
          setStatus("saved");
        }
        return null;
      });
    },
    [performSave, reset],
  );

  const items = useMemo(() => activeItems(list), [list]);
  const archived = useMemo(() => archivedItemsOp(list), [list]);
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
      archivedItems: archived,
      checkedCount,
      ...edits,
      reload,
      conflict,
      resolveConflict,
      status,
      dirty,
      saveNow,
      undo,
      redo,
      canUndo,
      canRedo,
    }),
    [
      doc,
      items,
      archived,
      checkedCount,
      edits,
      reload,
      conflict,
      resolveConflict,
      status,
      dirty,
      saveNow,
      undo,
      redo,
      canUndo,
      canRedo,
    ],
  );
}
