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
  addItem as addItemOp,
  createChecklist,
  deleteItem as deleteItemOp,
  moveItem as moveItemOp,
  setArchived,
  toggleItem as toggleItemOp,
} from "../domain/checklists.ts";
import type { Checklist, ChecklistItem, Snapshot } from "../domain/types.ts";
import {
  AuthError,
  ConflictError,
  RateLimitError,
  type StorageAdapter,
} from "../storage/adapter.ts";
import { BrowserLocalStorageAdapter } from "../storage/local/index.ts";
import { parse, serialize } from "../storage/serialize.ts";

const log = createLogger("checklist");

const newId = (): string => crypto.randomUUID();
const now = (): string => new Date().toISOString();
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

export interface UseChecklist {
  /** The full in-memory document (used by the conflict summary). */
  snapshot: Snapshot;
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
}

// Guarantee the document always has one checklist to render. A freshly
// created default list isn't persisted until the first real edit, so a
// bare reload never writes an empty document.
function withActiveList(snapshot: Snapshot): Snapshot {
  if (snapshot.checklists.length > 0) return snapshot;
  const list = createChecklist(newId(), DEFAULT_LIST_NAME, now());
  return { ...snapshot, checklists: [list] };
}

export function useChecklist(adapter?: StorageAdapter): UseChecklist {
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
      setDoc(withActiveList(parse(stored?.text)));
    });
    return () => {
      cancelled = true;
    };
  }, [active, flushSave]);

  // Flush any pending save on unmount so a debounced edit isn't lost.
  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  const list: Checklist =
    doc.checklists[0] ?? withActiveList(doc).checklists[0]!;

  const commit = useCallback(
    (nextList: Checklist) => {
      setDoc((prev) => {
        const next: Snapshot = {
          ...prev,
          checklists: prev.checklists.map((c) =>
            c.id === nextList.id ? nextList : c,
          ),
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

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

  const reload = useCallback(async () => {
    flushSave();
    const stored = await adapterRef.current.load();
    revisionRef.current = stored?.revision;
    setConflict(null);
    setStatus("idle");
    setDirty(false);
    setDoc(withActiveList(parse(stored?.text)));
  }, [flushSave]);

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
          setDirty(false);
          setStatus("saved");
        }
        return null;
      });
    },
    [performSave],
  );

  const items = useMemo(() => activeItems(list), [list]);
  const checkedCount = useMemo(
    () => items.filter((it) => it.checked).length,
    [items],
  );

  return {
    snapshot: doc,
    items,
    checkedCount,
    addItem,
    toggle,
    remove,
    archive,
    reorder,
    reload,
    conflict,
    resolveConflict,
    status,
    dirty,
    saveNow,
  };
}
