// The checklist's persistence engine: the debounced-save plumbing, the
// save-status / dirty / conflict state machine, and the load / reload /
// save-now / resolve-conflict verbs that move bytes between the in-memory
// document and the active StorageAdapter.
//
// Split out of `use-checklist.ts` so a new save / conflict feature lands
// in this concern-scoped file rather than the central hook. The undo
// timeline is threaded in by reference: the load / reload / conflict-adopt
// paths must reset the timeline (the old history describes edits against a
// document that's gone), but the timeline hook is constructed *after* this
// one in `use-checklist.ts` (it needs this hook's `setDoc` / `scheduleSave`
// to apply an undone snapshot). That construction cycle is broken with a
// ref: the parent passes an empty `resetHistory` ref here, then points it
// at the real `reset` once the timeline exists.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { createLogger } from "../dev/logger.ts";
import { createChecklist } from "../domain/checklists.ts";
import type { Snapshot } from "../domain/types.ts";
import {
  AuthError,
  ConflictError,
  RateLimitError,
  type StorageAdapter,
} from "../storage/adapter.ts";
import { parse, serialize } from "../storage/serialize.ts";
import { newId, now } from "./side-effects.ts";

const log = createLogger("checklist");

/** The name a freshly-minted checklist carries until the user renames it. */
export const DEFAULT_LIST_NAME = "Checklist";

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

// Guarantee the document always has one checklist to render. A freshly
// created default list isn't persisted until the first real edit, so a
// bare reload never writes an empty document.
export function withActiveList(snapshot: Snapshot): Snapshot {
  if (snapshot.checklists.length > 0) return snapshot;
  const list = createChecklist(newId(), DEFAULT_LIST_NAME, now());
  return { ...snapshot, checklists: [list] };
}

export interface ChecklistSync {
  /** The full in-memory document. */
  doc: Snapshot;
  /** Latest document, readable from async callbacks without re-subscribing. */
  docRef: MutableRefObject<Snapshot>;
  /** Swap the visible document for an immediate re-render. */
  setDoc: (next: Snapshot) => void;
  /** Persist the edited document (debounced by the active backend). */
  scheduleSave: (next: Snapshot) => void;
  /** Set when a save collided with a newer remote revision; else null. */
  conflict: ConflictState | null;
  /** Coarse state of the last save, for the cloud-sync status glyph. */
  status: SaveStatus;
  /** Whether there are local edits not yet persisted to the backend. */
  dirty: boolean;
  /** Re-read the document from the active backend, replacing what's on screen. */
  reload: () => Promise<void>;
  /** Flush any debounced save immediately (the "save now" affordance). */
  saveNow: () => void;
  /** Resolve an open conflict by keeping this device's copy or the remote's. */
  resolveConflict: (keep: "local" | "remote") => void;
}

export function useChecklistSync(deps: {
  /** The active backend. A swap triggers a reload of the new document. */
  active: StorageAdapter;
  /**
   * Reset the undo timeline whenever the document arrives from outside the
   * edit path (load, reload, conflict-adopt). Held by ref because the
   * timeline hook is built after this one — see the module header.
   */
  resetHistory: MutableRefObject<(seed: Snapshot) => void>;
}): ChecklistSync {
  const { active, resetHistory } = deps;

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
      const loaded = withActiveList(parse(stored?.text));
      setDoc(loaded);
      // The freshly-loaded document is a new baseline — drop the old
      // backend's undo history so "undo" can't jump to a vanished state.
      resetHistory.current(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [active, flushSave, resetHistory]);

  // Flush any pending save on unmount so a debounced edit isn't lost.
  useEffect(() => {
    return () => {
      flushSave();
    };
  }, [flushSave]);

  const reload = useCallback(async () => {
    flushSave();
    const stored = await adapterRef.current.load();
    revisionRef.current = stored?.revision;
    setConflict(null);
    setStatus("idle");
    setDirty(false);
    const reloaded = withActiveList(parse(stored?.text));
    setDoc(reloaded);
    resetHistory.current(reloaded);
  }, [flushSave, resetHistory]);

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
          resetHistory.current(current.remote);
          setDirty(false);
          setStatus("saved");
        }
        return null;
      });
    },
    [performSave, resetHistory],
  );

  return {
    doc,
    docRef,
    setDoc,
    scheduleSave,
    conflict,
    status,
    dirty,
    reload,
    saveNow,
    resolveConflict,
  };
}
