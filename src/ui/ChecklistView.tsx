import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { findItem, flattenForDisplay } from "../domain/checklists.ts";
import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { AddItemButton } from "./AddItemButton.tsx";
import { AddItemForm } from "./AddItemForm.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { ChecklistTitle } from "./ChecklistTitle.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { DragGhostRow } from "./DragGhostRow.tsx";
import { ItemCount } from "./ItemCount.tsx";
import { SyncStatus } from "./SyncStatus.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { useChecklistContext } from "./checklist-context.ts";
import { useReportDragActivity } from "./drag-activity.ts";
import { ghostPlacement } from "./dragGhostPlacement.ts";
import { useContextMenu } from "./hooks/useContextMenu.ts";
import { useDesktopPointer } from "./hooks/useMediaQuery.ts";
import { useListReorder } from "./hooks/useListReorder.ts";
import { useReorderFlip } from "./hooks/useReorderFlip.ts";
import { ArchiveIcon, TrashIcon } from "./icons.tsx";

// Presentational shell for the checklist: a quiet, monospaced, single
// column reminiscent of a plain-text editor. State-free — it reads the
// checklist surface from `useChecklistContext`, so App stops threading
// data and callbacks through a `Props` chain and nothing in ui/ reaches
// back into app/ at runtime (the context lives in ui/).
//
// The shell is pinned to the viewport (the document itself never scrolls);
// only the item list scrolls internally, which keeps the header and composer
// in view and stops iOS Safari from rubber-banding a near-empty list.

// Memoised and prop-free: it re-renders only when the checklist context
// value changes. App holds appearance settings alongside the checklist, so
// every settings edit (a color-swatch drag fires `onChange` continuously)
// re-renders App — but the context value keeps a stable identity across
// those renders (see `useChecklist`'s memoized return and App's memoized
// provider value), so `memo` skips the whole list instead of reconciling N
// rows. Theme is applied as CSS vars on `:root`, not through context.
function ChecklistViewImpl() {
  const {
    items,
    visibleCount,
    checkedCount,
    addItem,
    addItemAfter,
    importItems,
    importItemsAfter,
    editItem,
    toggle,
    remove,
    removeEmpty,
    archive,
    archiveFinished,
    deleteFinished,
    reorder,
    sync,
    checklists,
    activeChecklistId,
    activeList,
    renameChecklist,
    addItemPosition,
    logoSrc,
    disableItemNotes,
    showItemCount,
    animateReorder,
  } = useChecklistContext();
  const t = useT();
  const activeName =
    checklists.find((c) => c.id === activeChecklistId)?.name ?? t("app.title");

  // Which sub-lists are collapsed (children hidden). Local, non-persisted view
  // state — the same shape as a revealed note body: expanded by default, a tap
  // on the caret hides the children. New items default to expanded.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // The item tree flattened into the ordered, depth-tagged rows the list
  // renders; a collapsed item's children are skipped.
  const rows = useMemo(
    () => flattenForDisplay(items, collapsed),
    [items, collapsed],
  );

  // A row can't be dropped onto itself or one of its own descendants (that
  // would orphan the subtree). The reorder hook consults this before offering
  // a row as a drop target.
  const canDrop = useCallback(
    (draggedId: string, targetId: string) => {
      if (draggedId === targetId) return false;
      const dragged = findItem(items, draggedId);
      return !!dragged && !findItem(dragged.children ?? [], targetId);
    },
    [items],
  );
  const reorderCtl = useListReorder(reorder, canDrop);

  // Slide rows into place when the displayed order changes — a checked item
  // sinking to the bottom. Suspended while a pointer drag owns the row
  // transforms, and off entirely unless the user has the sort + its animation
  // enabled (see `animateReorder`).
  useReorderFlip(
    reorderCtl.containerRef,
    animateReorder,
    reorderCtl.draggingId !== null,
  );

  // A background save can collide with another device mid-drag, raising the
  // non-dismissable conflict modal over the list. Tear the drag down when that
  // happens: otherwise the lifted row keeps its pointer capture and floats
  // frozen on top of the modal, swallowing the taps meant to resolve it.
  const conflicted = sync?.status === "conflict";
  const cancelDrag = reorderCtl.cancel;
  useEffect(() => {
    if (conflicted) cancelDrag();
  }, [conflicted, cancelDrag]);

  // A live reorder drag owns the screen — report it so the document-level
  // pull-to-refresh stands down. Dragging a row downward would otherwise arm a
  // refresh at the same time.
  const reportDrag = useReportDragActivity();
  const reordering = reorderCtl.draggingId !== null;
  useEffect(() => {
    reportDrag(reordering);
    return () => {
      if (reordering) reportDrag(false);
    };
  }, [reordering, reportDrag]);

  // Desktop swaps each row's swipe-to-reveal gesture for a right-click menu
  // carrying the same archive / delete actions. `openMenu` is referentially
  // stable, so handing it to the memoized rows doesn't re-render the list.
  const desktop = useDesktopPointer();
  const {
    state: menuState,
    open: openMenu,
    close: closeMenu,
  } = useContextMenu();
  const openRowMenu = useCallback(
    (id: string, e: React.MouseEvent) => {
      openMenu(
        [
          {
            label: t("app.archive"),
            icon: <ArchiveIcon className="h-4 w-4" />,
            onSelect: () => archive(id),
          },
          {
            label: t("app.delete"),
            icon: <TrashIcon className="h-4 w-4" />,
            danger: true,
            onSelect: () => remove(id),
          },
        ],
        e,
      );
    },
    [openMenu, t, archive, remove],
  );

  // While a row is lifted, the rows of its own subtree are hidden: the subtree
  // travels with the drag, stood in for by the single floating row plus the
  // ghost preview, so leaving its children parked mid-list would read as
  // broken. The lifted row itself stays rendered (it's the floating copy).
  const draggingId = reorderCtl.draggingId;
  const hiddenIds = useMemo(() => {
    if (!draggingId) return null;
    const dragged = findItem(items, draggingId);
    if (!dragged?.children?.length) return null;
    const ids = new Set<string>();
    const walk = (list: readonly ChecklistItem[]) => {
      for (const c of list) {
        ids.add(c.id);
        if (c.children) walk(c.children);
      }
    };
    walk(dragged.children);
    return ids;
  }, [draggingId, items]);

  // The item under the finger and where its ghost preview snaps in. Recomputed
  // each move from the live drop target; null when nothing is being dragged.
  const draggedItem = draggingId ? findItem(items, draggingId) : null;
  const ghost = draggingId ? ghostPlacement(rows, reorderCtl.dropTarget) : null;

  // The inline composer is only mounted while drafting: the add button opens
  // it, Enter / blur-with-text commits through `addItem`, and an empty blur
  // just unmounts it again — so a blank item is never created.
  const [drafting, setDrafting] = useState(false);

  // The id of the item a sub-item composer is open under (null when none). The
  // editor's "Add sub-item" button opens it; new items land as children of this
  // item, so a checklist tree grows without dragging.
  const [childDraftParentId, setChildDraftParentId] = useState<string | null>(
    null,
  );

  // The item an "after this row" composer sits below (null when none). Enter on
  // a row editor opens it anchored to that row; each item the composer adds
  // lands directly after the anchor, and the anchor then advances to the new
  // item so successive entries walk straight down the list (see `addAfterItem`).
  const [afterDraftAnchorId, setAfterDraftAnchorId] = useState<string | null>(
    null,
  );

  const closeChildDraft = useCallback(() => setChildDraftParentId(null), []);
  const closeAfterDraft = useCallback(() => setAfterDraftAnchorId(null), []);
  // The three composer kinds are mutually exclusive — opening one closes the
  // others so only a single draft row is ever live.
  const startDraft = useCallback(() => {
    setChildDraftParentId(null);
    setAfterDraftAnchorId(null);
    setDrafting(true);
  }, []);
  const closeDraft = useCallback(() => setDrafting(false), []);
  const startChildDraft = useCallback((parentId: string) => {
    setDrafting(false);
    setAfterDraftAnchorId(null);
    setChildDraftParentId(parentId);
    // Make sure the parent's sub-list is showing, else the composer (and the
    // children it adds) would be tucked behind a collapsed caret.
    setCollapsed((prev) => {
      if (!prev.has(parentId)) return prev;
      const next = new Set(prev);
      next.delete(parentId);
      return next;
    });
  }, []);
  const startAfterDraft = useCallback((afterId: string) => {
    setDrafting(false);
    setChildDraftParentId(null);
    setAfterDraftAnchorId(afterId);
  }, []);

  // When the composer adds an item via Shift+Enter, it hands the new row's
  // id here so that row opens straight into its body editor. The row clears
  // the flag once it's consumed it, so it fires exactly once.
  const [editBodyOfId, setEditBodyOfId] = useState<string | null>(null);
  const clearEditBody = useCallback(() => setEditBodyOfId(null), []);

  // Backspacing an empty line removes it and hands editing to the line above.
  // The view names that line here so its row opens straight into its title
  // editor; the row clears the flag once consumed, so it fires exactly once.
  const [editTitleOfId, setEditTitleOfId] = useState<string | null>(null);
  const clearEditTitle = useCallback(() => setEditTitleOfId(null), []);
  const backspaceEmpty = useCallback(
    (id: string): boolean => {
      const index = rows.findIndex((r) => r.item.id === id);
      // Nothing above the top line to back up into — let the keypress fall
      // through so the empty line is only cleaned up on blur.
      if (index <= 0) return false;
      removeEmpty(id);
      setEditTitleOfId(rows[index - 1]!.item.id);
      return true;
    },
    [rows, removeEmpty],
  );
  const addItemAndEditBody = useCallback(
    (title: string) => {
      const id = addItem(title);
      if (id) setEditBodyOfId(id);
      // Close the composer — focus moves to the new row's body field.
      setDrafting(false);
    },
    [addItem],
  );

  // The sub-item composer's verbs, bound to the parent it's open under so each
  // entry lands as a child of that item. A null parent (composer closed) makes
  // them inert.
  const addChildItem = useCallback(
    (title: string) =>
      childDraftParentId ? addItem(title, childDraftParentId) : null,
    [addItem, childDraftParentId],
  );
  const importChildItems = useCallback(
    (markdown: string) =>
      childDraftParentId ? importItems(markdown, childDraftParentId) : 0,
    [importItems, childDraftParentId],
  );
  const addChildAndEditBody = useCallback(
    (title: string) => {
      if (!childDraftParentId) return;
      const id = addItem(title, childDraftParentId);
      if (id) setEditBodyOfId(id);
      setChildDraftParentId(null);
    },
    [addItem, childDraftParentId],
  );

  // The after-an-item composer's verbs, bound to the anchor it sits below. Each
  // add inserts after the anchor and then makes the new item the anchor, so a
  // run of entries chains downward in order rather than stacking up reversed
  // above the original row. A null anchor (composer closed) makes them inert.
  const addAfterItem = useCallback(
    (title: string) => {
      if (afterDraftAnchorId === null) return;
      const id = addItemAfter(title, afterDraftAnchorId);
      if (id) setAfterDraftAnchorId(id);
    },
    [addItemAfter, afterDraftAnchorId],
  );
  const addAfterAndEditBody = useCallback(
    (title: string) => {
      if (afterDraftAnchorId === null) return;
      const id = addItemAfter(title, afterDraftAnchorId);
      if (id) setEditBodyOfId(id);
      setAfterDraftAnchorId(null);
    },
    [addItemAfter, afterDraftAnchorId],
  );
  const importAfterItems = useCallback(
    (markdown: string): number => {
      if (afterDraftAnchorId === null) return 0;
      const { count, lastId } = importItemsAfter(markdown, afterDraftAnchorId);
      // Advance the anchor past the pasted block so a typed follow-up lands
      // below it, not wedged back in above.
      if (lastId) setAfterDraftAnchorId(lastId);
      return count;
    },
    [importItemsAfter, afterDraftAnchorId],
  );

  // Where the sub-item composer splices into the flattened rows, and at what
  // depth. A "top" add-position sits the composer right under the parent
  // (before its existing children); "bottom" sits it after the whole subtree —
  // matching where `addItem` actually drops the new child. -1 when closed.
  const childDraftDepth = useMemo(() => {
    if (childDraftParentId === null) return 0;
    const row = rows.find((r) => r.item.id === childDraftParentId);
    return row ? row.depth + 1 : 0;
  }, [rows, childDraftParentId]);
  const childDraftIndex = useMemo(() => {
    if (childDraftParentId === null) return -1;
    const parentIdx = rows.findIndex((r) => r.item.id === childDraftParentId);
    if (parentIdx === -1) return -1;
    if (addItemPosition === "top") return parentIdx + 1;
    const parentDepth = rows[parentIdx]!.depth;
    let i = parentIdx + 1;
    while (i < rows.length && rows[i]!.depth > parentDepth) i++;
    return i;
  }, [rows, childDraftParentId, addItemPosition]);

  // Where the after-an-item composer splices into the flattened rows, and at
  // what depth. It sits at the anchor's own depth (a sibling) and lands just
  // past the anchor's whole subtree — exactly where `addItemAfter` drops the
  // new sibling. -1 / 0 when closed.
  const afterDraftDepth = useMemo(() => {
    if (afterDraftAnchorId === null) return 0;
    const row = rows.find((r) => r.item.id === afterDraftAnchorId);
    return row ? row.depth : 0;
  }, [rows, afterDraftAnchorId]);
  const afterDraftIndex = useMemo(() => {
    if (afterDraftAnchorId === null) return -1;
    const anchorIdx = rows.findIndex((r) => r.item.id === afterDraftAnchorId);
    if (anchorIdx === -1) return -1;
    const anchorDepth = rows[anchorIdx]!.depth;
    let i = anchorIdx + 1;
    while (i < rows.length && rows[i]!.depth > anchorDepth) i++;
    return i;
  }, [rows, afterDraftAnchorId]);

  // The id of the row whose editor is open (null when none). The add button
  // hides while a row is being edited so it doesn't crowd the keyboard.
  const [editingId, setEditingId] = useState<string | null>(null);

  const draftRow = drafting ? (
    <AddItemForm
      onAdd={addItem}
      onAddWithBody={addItemAndEditBody}
      onImport={importItems}
      onClose={closeDraft}
      notesDisabled={disableItemNotes}
    />
  ) : null;

  // The sub-item composer, spliced into the row list at `childDraftIndex`.
  const childDraftRow =
    childDraftParentId !== null ? (
      <AddItemForm
        key="__child_draft"
        onAdd={addChildItem}
        onAddWithBody={addChildAndEditBody}
        onImport={importChildItems}
        onClose={closeChildDraft}
        notesDisabled={disableItemNotes}
        depth={childDraftDepth}
      />
    ) : null;

  // The after-an-item composer, spliced in just below its anchor row at the
  // anchor's own depth (see `afterDraftIndex`).
  const afterDraftRow =
    afterDraftAnchorId !== null ? (
      <AddItemForm
        key="__after_draft"
        onAdd={addAfterItem}
        onAddWithBody={addAfterAndEditBody}
        onImport={importAfterItems}
        onClose={closeAfterDraft}
        notesDisabled={disableItemNotes}
        depth={afterDraftDepth}
      />
    ) : null;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <header className="mb-2 flex items-center justify-between gap-2 border-b border-line px-1 pb-3">
        <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-wide text-fg-bright">
          <img
            src={logoSrc}
            alt=""
            aria-hidden
            className="h-6 w-6 shrink-0 rounded"
          />
          <ChecklistTitle
            name={activeName}
            onRename={(next) => renameChecklist(activeChecklistId, next)}
          />
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {showItemCount && (
            <ItemCount checked={checkedCount} total={visibleCount} />
          )}
          <CopyButton checklist={activeList} />
          {sync && (
            <SyncStatus
              providerName={sync.providerName}
              status={sync.status}
              dirty={sync.dirty}
              offline={sync.offline}
              onSave={sync.onSave}
              onOpenDetails={sync.onOpenDetails}
            />
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 [overscroll-behavior:contain] overflow-y-auto pb-24 sm:pb-0">
        {addItemPosition === "top" && draftRow}
        {items.length === 0 ? (
          !drafting && (
            <p className="px-2 py-8 text-center text-sm text-muted">
              {t("app.empty")}
            </p>
          )
        ) : (
          // `relative` so the lifted row can position itself absolutely
          // against the list; the ghost preview is spliced into the flow so
          // the surrounding rows open a gap exactly where the item will land.
          <ul
            ref={reorderCtl.containerRef}
            className="relative m-0 list-none p-0"
          >
            {rows.flatMap(({ item, depth, hasChildren }, i) => {
              const rowStyle = reorderCtl.rowStyle(item.id);
              const row = (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  onToggle={toggle}
                  onArchive={archive}
                  onDelete={remove}
                  onEdit={editItem}
                  onRemoveEmpty={removeEmpty}
                  onBackspaceEmpty={backspaceEmpty}
                  onAddAfter={startAfterDraft}
                  onAddChild={startChildDraft}
                  autoEditBody={item.id === editBodyOfId}
                  onAutoEditConsumed={clearEditBody}
                  autoEditTitle={item.id === editTitleOfId}
                  onAutoEditTitleConsumed={clearEditTitle}
                  onActiveEditorChange={setEditingId}
                  notesDisabled={disableItemNotes}
                  depth={depth}
                  hasChildren={hasChildren}
                  collapsed={collapsed.has(item.id)}
                  onToggleCollapse={toggleCollapse}
                  dropMode={
                    reorderCtl.dropTarget?.id === item.id
                      ? reorderCtl.dropTarget.mode
                      : null
                  }
                  dragHandleProps={reorderCtl.dragHandleProps(item.id)}
                  dragging={reorderCtl.draggingId === item.id}
                  style={
                    hiddenIds?.has(item.id)
                      ? { ...rowStyle, display: "none" }
                      : rowStyle
                  }
                  onContextMenu={desktop ? openRowMenu : undefined}
                />
              );
              const out: React.ReactNode[] = [];
              if (ghost && draggedItem && ghost.index === i) {
                out.push(
                  <DragGhostRow
                    key="__drag_ghost"
                    item={draggedItem}
                    depth={ghost.depth}
                  />,
                );
              }
              out.push(row);
              // Splice the sub-item composer in after the row it sits below.
              if (i === childDraftIndex - 1) out.push(childDraftRow);
              // Likewise the after-an-item composer, just below its anchor.
              if (i === afterDraftIndex - 1) out.push(afterDraftRow);
              return out;
            })}
            {ghost && draggedItem && ghost.index === rows.length && (
              <DragGhostRow
                key="__drag_ghost"
                item={draggedItem}
                depth={ghost.depth}
              />
            )}
          </ul>
        )}
        {addItemPosition === "bottom" && draftRow}
      </div>

      {!drafting &&
        !editingId &&
        childDraftParentId === null &&
        afterDraftAnchorId === null && (
          <AddItemButton
            onActivate={startDraft}
            onArchiveFinished={archiveFinished}
            onDeleteFinished={deleteFinished}
            finishedCount={checkedCount}
          />
        )}

      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          items={menuState.items}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

export const ChecklistView = memo(ChecklistViewImpl);
