// In-memory undo / redo over whole-document snapshots, adapted from the
// budget project's storage `useUndoRedo`. Each user edit records the
// resulting `Snapshot`; undo / redo walk a cursor back and forth over
// the recorded states and hand the target snapshot to `setData` so the
// outer hook's React state stays in agreement with the cursor.
//
// Because a snapshot is the *entire* document, a deleted item still
// lives in the prior entry — that's what lets "undo" bring it back. The
// budget original also tracked per-action labels for a history list;
// the checklist doesn't surface that timeline, so this pares the hook
// down to the bare undo / redo machinery.

import { useCallback, useReducer, useRef } from "react";

import type { Snapshot } from "../domain/types.ts";

// Maximum number of past states retained. Snapshots share structure
// with their neighbours (a mutation rebuilds only the touched checklist),
// so unchanged sub-trees are not duplicated across entries.
const UNDO_HISTORY_LIMIT = 50;

type HistoryState = {
  entries: Snapshot[];
  cursor: number;
};

// Named transitions kept pure: the side effect of swapping the visible
// document to the target snapshot lives in the caller, which reads the
// target off `stateRef` and pairs each cursor move with a `setData`.
type HistoryAction =
  | { kind: "reset"; seed: Snapshot }
  | { kind: "record"; snapshot: Snapshot }
  // Move the cursor by ±1, clamped at the timeline edges — the bounds
  // check is what makes undo / redo no-ops at the ends.
  | { kind: "step"; delta: -1 | 1 };

function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  switch (action.kind) {
    case "reset":
      return initialHistoryState(action.seed);
    case "record": {
      // Drop any "future" entries beyond the cursor — a fresh edit
      // overwrites the redo timeline. Append, then trim from the front
      // if the past portion would exceed the retention limit.
      const truncated = state.entries.slice(0, state.cursor + 1);
      const appended = [...truncated, action.snapshot];
      const cap = UNDO_HISTORY_LIMIT + 1;
      const dropped = Math.max(0, appended.length - cap);
      return {
        entries: dropped > 0 ? appended.slice(dropped) : appended,
        cursor: appended.length - 1 - dropped,
      };
    }
    case "step": {
      const next = state.cursor + action.delta;
      if (next < 0 || next >= state.entries.length) return state;
      return { entries: state.entries, cursor: next };
    }
  }
}

function initialHistoryState(seed: Snapshot): HistoryState {
  return { entries: [seed], cursor: 0 };
}

export type UndoRedo = {
  /** Record the document produced by a user edit as the newest entry. */
  record: (snapshot: Snapshot) => void;
  /**
   * Replace the timeline with a fresh seed. Called whenever the document
   * arrives from outside the edit path (initial / async load, backend
   * swap, conflict resolution adopting the remote) — the old history
   * would otherwise describe edits against a document that's gone.
   */
  reset: (seed: Snapshot) => void;
  /** Step back one entry, applying the prior snapshot via `setData`. */
  undo: () => void;
  /** Step forward one entry, applying the next snapshot via `setData`. */
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function useUndoRedo(params: {
  initialSeed: Snapshot;
  setData: (next: Snapshot) => void;
}): UndoRedo {
  const { initialSeed, setData } = params;

  // Stable ref so the cursor-move callbacks reach the latest `setData`
  // without re-subscribing on every render.
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  const [state, dispatch] = useReducer(
    historyReducer,
    initialSeed,
    initialHistoryState,
  );

  // Ref mirror so undo / redo can read the target entry synchronously
  // before dispatching — reading the closed-over `state` would lag a
  // render behind a freshly recorded entry.
  const stateRef = useRef(state);
  stateRef.current = state;

  const record = useCallback((snapshot: Snapshot) => {
    dispatch({ kind: "record", snapshot });
  }, []);

  const reset = useCallback((seed: Snapshot) => {
    dispatch({ kind: "reset", seed });
  }, []);

  const undo = useCallback(() => {
    const cur = stateRef.current;
    if (cur.cursor === 0) return;
    setDataRef.current(cur.entries[cur.cursor - 1]!);
    dispatch({ kind: "step", delta: -1 });
  }, []);

  const redo = useCallback(() => {
    const cur = stateRef.current;
    if (cur.cursor >= cur.entries.length - 1) return;
    setDataRef.current(cur.entries[cur.cursor + 1]!);
    dispatch({ kind: "step", delta: 1 });
  }, []);

  return {
    record,
    reset,
    undo,
    redo,
    canUndo: state.cursor > 0,
    canRedo: state.cursor < state.entries.length - 1,
  };
}
