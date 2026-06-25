import { useEffect, useState, type DragEvent as ReactDragEvent } from "react";

import {
  CHECKLIST_DROP_NS_PREFIX,
  parseDragId,
  useChecklistDragAbort,
  useChecklistDragKind,
  useChecklistDrop,
  useChecklistDropKey,
  type DragKind,
} from "../checklist-drag-context.ts";

// The dataTransfer MIME the desktop HTML5 drag stamps the list id onto, so a
// drop reads back which checklist was dragged.
export const CHECKLIST_DND_TYPE = "application/x-checklist-id";

// What's being dragged right now (null when idle): the desktop path records it
// locally (`draggingChecklist`), the touch path reports it through context
// (`touchDragKind`). A whole folder may only land on a namespace row.
export function deriveDragKind(
  draggingChecklist: string | null,
  touchDragKind: DragKind | null,
): DragKind | null {
  return draggingChecklist ? parseDragId(draggingChecklist).kind : touchDragKind;
}

// Whether a drop zone keyed `key` accepts the current drag. A dragged folder
// only drops onto a namespace row; over a folder / the ungrouped zone / the
// archive it's inert.
export function dropAcceptsKind(
  key: string,
  dragKind: DragKind | null,
): boolean {
  return key.startsWith(CHECKLIST_DROP_NS_PREFIX) || dragKind !== "folder";
}

// Whether the zone keyed `key` should show its hover highlight — either the
// desktop dragover (`dropTarget`) or the touch finger (`activeDropKey`) is over
// it, and the current drag is one it accepts.
export function isKeyDropTarget(
  key: string,
  dropTarget: string | null,
  activeDropKey: string | null,
  dragKind: DragKind | null,
): boolean {
  return (
    (dropTarget === key || activeDropKey === key) &&
    dropAcceptsKind(key, dragKind)
  );
}

export type SideMenuDrag = {
  /** The id currently lifted by the desktop HTML5 drag (null when idle). */
  draggingChecklist: string | null;
  /** Begin a desktop drag of `id`, stamping it onto the dataTransfer. */
  startChecklistDrag: (e: ReactDragEvent, id: string) => void;
  /** Clear the desktop drag lift and any hover highlight. */
  endChecklistDrag: () => void;
  /** `onDragOver` for a drop zone: gate, highlight, and accept the move. */
  allowDropOn: (e: ReactDragEvent, key: string) => void;
  /** `onDrop` for a zone: resolve which list was dragged and move it there. */
  commitDrop: (e: ReactDragEvent, key: string) => void;
  /** `onDragLeave` for a zone: drop the hover highlight as the drag exits. */
  clearDropTarget: () => void;
  /** Whether zone `key` should render its hover highlight right now. */
  isDropTarget: (key: string) => boolean;
};

// Coordinates the sidebar's checklist drag-to-move: the desktop HTML5 drag
// state (`draggingChecklist` gates the drop targets so a stray dragover from
// outside doesn't light them up, `dropTarget` drives the hover highlight) plus
// the touch long-press path, which reports its hovered target and dragged kind
// through context. Both paths commit through the same `onDrop` resolver (`App`).
export function useSideMenuDrag(): SideMenuDrag {
  const onDrop = useChecklistDrop();
  const activeDropKey = useChecklistDropKey();
  const touchDragKind = useChecklistDragKind();
  const dragAbort = useChecklistDragAbort();
  const [draggingChecklist, setDraggingChecklist] = useState<string | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const dragKind = deriveDragKind(draggingChecklist, touchDragKind);
  const isDropTarget = (key: string) =>
    isKeyDropTarget(key, dropTarget, activeDropKey, dragKind);

  // Clear the desktop drag's lift if the app aborts mid-drag (a sync conflict,
  // a background reload) — the row may unmount before `dragend` fires, which
  // would otherwise leave it stranded dimmed. See the overview's note on
  // `DragAbortContext`. Idle on mount and whenever nothing is lifted.
  useEffect(() => {
    setDraggingChecklist(null);
    setDropTarget(null);
  }, [dragAbort]);

  function startChecklistDrag(e: ReactDragEvent, id: string) {
    e.dataTransfer.setData(CHECKLIST_DND_TYPE, id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingChecklist(id);
  }
  function endChecklistDrag() {
    setDraggingChecklist(null);
    setDropTarget(null);
  }
  function clearDropTarget() {
    setDropTarget(null);
  }
  function allowDropOn(e: ReactDragEvent, key: string) {
    if (!draggingChecklist) return;
    // A dragged folder only drops onto a namespace; leaving folder / root /
    // archive un-prevented makes the browser refuse the drop there entirely.
    if (!dropAcceptsKind(key, dragKind)) return;
    e.preventDefault();
    // Folders nest inside the ungrouped root drop zone, so stop the hover from
    // bubbling up and lighting the root highlight at the same time.
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== key) setDropTarget(key);
  }
  function commitDrop(e: ReactDragEvent, key: string) {
    e.preventDefault();
    // A drop on a folder/namespace must not also bubble to the root zone
    // (which would immediately move the list back out to the top level).
    e.stopPropagation();
    const id = e.dataTransfer.getData(CHECKLIST_DND_TYPE) || draggingChecklist;
    endChecklistDrag();
    if (id) onDrop(id, key);
  }

  return {
    draggingChecklist,
    startChecklistDrag,
    endChecklistDrag,
    allowDropOn,
    commitDrop,
    clearDropTarget,
    isDropTarget,
  };
}
