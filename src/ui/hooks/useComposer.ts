import { useCallback, useMemo, useState } from "react";

import type { DisplayRow } from "../../domain/checklists.ts";

// The three mutually-exclusive add-item composers the checklist offers,
// modelled as one discriminated state so only a single draft row is ever
// live and a reader doesn't have to track three parallel booleans:
//
//   - `inline` — the floating add button's composer; new items land at the
//     root (top or bottom per `addItemPosition`).
//   - `child`  — opened from a row's "Add sub-item"; items land as children
//     of `parentId`, so the tree grows without dragging.
//   - `after`  — opened by pressing Enter on a row editor; items land
//     directly after `anchorId`, and the anchor advances to each new item so
//     a run of entries walks straight down the list.
export type ComposerState =
  | { kind: "none" }
  | { kind: "inline" }
  | { kind: "child"; parentId: string }
  | { kind: "after"; anchorId: string };

export type ComposerKind = ComposerState["kind"];

// Everything one open composer needs to render its `AddItemForm` and splice
// it into the flattened row list. `spliceIndex` is where the form sits among
// the rows (used both to position the in-list composers and to know which row
// a Backspace should back editing up into); `depth` indents it to its level.
export interface ActiveComposer {
  kind: Exclude<ComposerKind, "none">;
  /** Add and keep the composer open for the next entry. */
  onAdd: (title: string) => void;
  /** Add, open the new item's note body, and close the composer. */
  onAddWithBody: (title: string) => void;
  /** Import a pasted markdown checklist; returns how many items landed. */
  onImport: (markdown: string) => number;
  onClose: () => void;
  spliceIndex: number;
  depth: number;
}

export interface ComposerOptions {
  rows: readonly DisplayRow[];
  addItemPosition: "top" | "bottom";
  addItem: (title: string, parentId?: string) => string | null;
  addItemAfter: (title: string, afterId: string) => string | null;
  importItems: (markdown: string, parentId?: string) => number;
  importItemsAfter: (
    markdown: string,
    afterId: string,
  ) => { count: number; lastId: string | null };
  /** Open the given row's note body editor (after a Shift+Enter add). */
  onEditBody: (id: string) => void;
  /** Reveal a collapsed parent so its new child composer isn't hidden. */
  revealItem: (id: string) => void;
}

export interface Composer {
  kind: ComposerKind;
  /** The single live composer, or null when none is open. */
  active: ActiveComposer | null;
  startInline: () => void;
  startChild: (parentId: string) => void;
  startAfter: (anchorId: string) => void;
  close: () => void;
}

// Where a composer anchored to `anchorId` splices into the flattened rows: the
// index just past the anchor's whole subtree, matching where `addItemAfter`
// drops the new sibling. -1 when the anchor isn't in the current rows.
function indexPastSubtree(
  rows: readonly DisplayRow[],
  anchorId: string,
): number {
  const anchorIdx = rows.findIndex((r) => r.item.id === anchorId);
  if (anchorIdx === -1) return -1;
  const anchorDepth = rows[anchorIdx]!.depth;
  let i = anchorIdx + 1;
  while (i < rows.length && rows[i]!.depth > anchorDepth) i++;
  return i;
}

/**
 * The checklist's add-item composer state machine. Owns the single
 * discriminated `ComposerState`, the mutually-exclusive openers, and the
 * derived splice position / verbs for whichever composer is live — so
 * `ChecklistView` keeps only the display wiring. Pure over its inputs: every
 * side effect (committing an add, opening a body editor, revealing a parent)
 * goes through a callback the caller supplies.
 */
export function useComposer(opts: ComposerOptions): Composer {
  const {
    rows,
    addItemPosition,
    addItem,
    addItemAfter,
    importItems,
    importItemsAfter,
    onEditBody,
    revealItem,
  } = opts;

  const [state, setState] = useState<ComposerState>({ kind: "none" });

  const close = useCallback(() => setState({ kind: "none" }), []);
  const startInline = useCallback(() => setState({ kind: "inline" }), []);
  const startChild = useCallback(
    (parentId: string) => {
      setState({ kind: "child", parentId });
      // Make sure the parent's sub-list is showing, else the composer (and the
      // children it adds) would be tucked behind a collapsed caret.
      revealItem(parentId);
    },
    [revealItem],
  );
  const startAfter = useCallback(
    (anchorId: string) => setState({ kind: "after", anchorId }),
    [],
  );

  const active = useMemo<ActiveComposer | null>(() => {
    switch (state.kind) {
      case "none":
        return null;

      case "inline":
        return {
          kind: "inline",
          onAdd: (title) => {
            addItem(title);
          },
          onAddWithBody: (title) => {
            const id = addItem(title);
            if (id) onEditBody(id);
            // Close the composer — focus moves to the new row's body field.
            close();
          },
          onImport: (markdown) => importItems(markdown),
          onClose: close,
          // The top-position composer sits above the whole list (nothing to
          // back up into); the bottom-position one sits past the last row.
          spliceIndex: addItemPosition === "top" ? 0 : rows.length,
          depth: 0,
        };

      case "child": {
        const { parentId } = state;
        const parentIdx = rows.findIndex((r) => r.item.id === parentId);
        const parentRow = parentIdx === -1 ? undefined : rows[parentIdx];
        // A "top" add-position sits the composer right under the parent
        // (before its existing children); "bottom" sits it past the whole
        // subtree — matching where `addItem` drops the new child.
        const spliceIndex =
          parentIdx === -1
            ? -1
            : addItemPosition === "top"
              ? parentIdx + 1
              : indexPastSubtree(rows, parentId);
        return {
          kind: "child",
          onAdd: (title) => {
            addItem(title, parentId);
          },
          onAddWithBody: (title) => {
            const id = addItem(title, parentId);
            if (id) onEditBody(id);
            close();
          },
          onImport: (markdown) => importItems(markdown, parentId),
          onClose: close,
          spliceIndex,
          depth: parentRow ? parentRow.depth + 1 : 0,
        };
      }

      case "after": {
        const { anchorId } = state;
        const anchorRow = rows.find((r) => r.item.id === anchorId);
        return {
          kind: "after",
          // Each add inserts after the anchor and then makes the new item the
          // anchor, so a run of entries chains downward in order rather than
          // stacking up reversed above the original row.
          onAdd: (title) => {
            const id = addItemAfter(title, anchorId);
            if (id) setState({ kind: "after", anchorId: id });
          },
          onAddWithBody: (title) => {
            const id = addItemAfter(title, anchorId);
            if (id) onEditBody(id);
            close();
          },
          onImport: (markdown) => {
            const { count, lastId } = importItemsAfter(markdown, anchorId);
            // Advance the anchor past the pasted block so a typed follow-up
            // lands below it, not wedged back in above.
            if (lastId) setState({ kind: "after", anchorId: lastId });
            return count;
          },
          onClose: close,
          spliceIndex: indexPastSubtree(rows, anchorId),
          depth: anchorRow ? anchorRow.depth : 0,
        };
      }
    }
  }, [
    state,
    rows,
    addItemPosition,
    addItem,
    addItemAfter,
    importItems,
    importItemsAfter,
    onEditBody,
    close,
  ]);

  return {
    kind: state.kind,
    active,
    startInline,
    startChild,
    startAfter,
    close,
  };
}
