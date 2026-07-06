import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { unlock } from "../achievements/bus.ts";
import { findItem, flattenForDisplay } from "../domain/checklists.ts";
import { archivedTitlePool } from "../domain/suggestions.ts";
import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { AddItemButton } from "./AddItemButton.tsx";
import { AddItemForm } from "./AddItemForm.tsx";
import { ArchivedDrawer } from "./ArchivedDrawer.tsx";
import { resolveActiveEditor } from "./activeEditor.ts";
import { ChecklistGlyphButton } from "./ChecklistGlyphButton.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { ChecklistTitle } from "./ChecklistTitle.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { DragGhostRow } from "./DragGhostRow.tsx";
import { ItemCount } from "./ItemCount.tsx";
import { SyncStatus } from "./SyncStatus.tsx";
import { ContextMenu } from "./ContextMenu.tsx";
import { useChecklistContext } from "./checklist-context.ts";
import { useFocusItem } from "./focus-item.ts";
import { useReportDragActivity } from "./drag-activity.ts";
import { ghostPlacement } from "./dragGhostPlacement.ts";
import { useComposer } from "./hooks/useComposer.ts";
import { useContextMenu } from "./hooks/useContextMenu.ts";
import { useDesktopPointer } from "./hooks/useMediaQuery.ts";
import { useListReorder } from "./hooks/useListReorder.ts";
import { useReorderFlip } from "./hooks/useReorderFlip.ts";
import { useSwipeUpReveal } from "./hooks/useSwipeUpReveal.ts";
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
    checkAll,
    uncheckAll,
    remove,
    removeEmpty,
    archive,
    archiveFinished,
    deleteFinished,
    unarchive,
    archivedGroups,
    reorder,
    sync,
    checklists,
    activeChecklistId,
    activeList,
    renameChecklist,
    setChecklistAppearance,
    addItemPosition,
    disableItemNotes,
    showItemCount,
    includeArchivedInCopy,
    capitalizeItems,
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

  // Archived titles feed the composer's typeahead: a previously archived
  // item ("Carrots") is re-added with one press instead of retyped.
  const suggestionPool = useMemo(
    () => archivedTitlePool(activeList),
    [activeList],
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

  // A search result can ask this view to reveal one item: once the list it
  // belongs to is the active one (so `rows` holds it), scroll the row into
  // centre and flash it, then drain the request so it fires exactly once. A
  // target hidden behind a collapsed parent simply isn't found — drop the
  // request rather than leave it pending forever.
  const { pendingId, clearFocus } = useFocusItem();
  const focusContainerRef = reorderCtl.containerRef;
  useEffect(() => {
    if (!pendingId) return;
    const container = focusContainerRef.current;
    const el = container?.querySelector<HTMLElement>(
      `[data-reorder-id="${CSS.escape(pendingId)}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("search-flash");
      const timer = window.setTimeout(
        () => el.classList.remove("search-flash"),
        1600,
      );
      clearFocus();
      return () => window.clearTimeout(timer);
    }
    clearFocus();
  }, [pendingId, rows, clearFocus, focusContainerRef]);

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
  // Backspacing an empty composer dismisses the draft row and backs editing
  // up into the line directly above where the composer is spliced in (the row
  // at `spliceIndex - 1`). Closing is composer-specific, so the caller passes
  // its own `close`. Nothing above (composer at the very top) declines it.
  const backspaceDraft = useCallback(
    (spliceIndex: number, close: () => void): boolean => {
      const above = spliceIndex > 0 ? rows[spliceIndex - 1] : undefined;
      if (!above) return false;
      close();
      setEditTitleOfId(above.item.id);
      return true;
    },
    [rows],
  );
  // Reveal a collapsed item so a composer opened under it (and the children it
  // adds) isn't tucked behind the caret.
  const revealItem = useCallback((id: string) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // The add-item composer state machine: one discriminated state for the three
  // mutually-exclusive composers (inline / sub-item / after-an-item), with the
  // active composer's verbs and splice position derived in one place. The view
  // below keeps only the display wiring.
  const composer = useComposer({
    rows,
    addItemPosition,
    addItem,
    addItemAfter,
    importItems,
    importItemsAfter,
    onEditBody: setEditBodyOfId,
    revealItem,
  });
  const { active } = composer;

  // The id of the row whose editor is open (null when none). The add button
  // hides while a row is being edited so it doesn't crowd the keyboard.
  const [editingId, setEditingId] = useState<string | null>(null);
  // A row reports its editor opening or closing; `resolveActiveEditor` keeps a
  // close from clearing the id once editing has already moved to another row
  // (see its comment), so the add button doesn't flash back over the keyboard.
  const setEditorActive = useCallback((id: string, active: boolean) => {
    setEditingId((cur) => resolveActiveEditor(cur, id, active));
  }, []);

  // The inline composer, mounted only while it's the active kind; it renders
  // above or below the whole list per `addItemPosition`.
  const inline = active?.kind === "inline" ? active : null;
  const draftRow = inline ? (
    <AddItemForm
      onAdd={inline.onAdd}
      onAddWithBody={inline.onAddWithBody}
      onImport={inline.onImport}
      onClose={inline.onClose}
      onBackspaceEmpty={() =>
        backspaceDraft(inline.spliceIndex, inline.onClose)
      }
      notesDisabled={disableItemNotes}
      capitalize={capitalizeItems}
      suggestionPool={suggestionPool}
    />
  ) : null;

  // The sub-item / after-an-item composer, spliced into the row list just
  // below its anchor row at `active.spliceIndex` (see `useComposer`). Only one
  // is ever live, so a single element covers both — keyed by kind so switching
  // between them remounts a fresh form.
  const inListDraft = active && active.kind !== "inline" ? active : null;
  const inListDraftRow = inListDraft ? (
    <AddItemForm
      key={inListDraft.kind === "child" ? "__child_draft" : "__after_draft"}
      onAdd={inListDraft.onAdd}
      onAddWithBody={inListDraft.onAddWithBody}
      onImport={inListDraft.onImport}
      onClose={inListDraft.onClose}
      onBackspaceEmpty={() =>
        backspaceDraft(inListDraft.spliceIndex, inListDraft.onClose)
      }
      notesDisabled={disableItemNotes}
      capitalize={capitalizeItems}
      depth={inListDraft.depth}
      suggestionPool={suggestionPool}
    />
  ) : null;

  // The active list's archived items, revealed by swiping up at the foot of
  // the list. Derived from the whole-document archive grouping, filtered to
  // this list — the drawer stays scoped to the list in front of the user.
  const archivedForActive = useMemo(
    () => archivedGroups.find((g) => g.id === activeChecklistId)?.items ?? [],
    [archivedGroups, activeChecklistId],
  );
  const [archiveDrawerOpen, setArchiveDrawerOpen] = useState(false);
  const closeArchiveDrawer = useCallback(() => setArchiveDrawerOpen(false), []);
  const openArchiveDrawer = useCallback(() => {
    setArchiveDrawerOpen(true);
    unlock("peekBehind");
  }, []);

  // The scrolling item region — the swipe-up gesture arms only while it's at
  // its bottom. Suppressed with nothing to reveal, while the drawer is
  // already up, and while an editor or a reorder drag owns the surface.
  const scrollRef = useRef<HTMLDivElement>(null);
  useSwipeUpReveal(scrollRef, {
    enabled:
      archivedForActive.length > 0 &&
      !archiveDrawerOpen &&
      !editingId &&
      !active &&
      reorderCtl.draggingId === null,
    onReveal: openArchiveDrawer,
  });

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <header className="mb-2 flex items-center justify-between gap-2 border-b border-line px-1 pb-3">
        <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-wide text-fg-bright">
          <ChecklistGlyphButton
            glyph={activeList.glyph ?? null}
            color={activeList.color ?? null}
            onChange={(patch) =>
              setChecklistAppearance(activeChecklistId, patch)
            }
          />
          <ChecklistTitle
            name={activeName}
            onRename={(next) => renameChecklist(activeChecklistId, next)}
          />
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {showItemCount && (
            <ItemCount
              checked={checkedCount}
              total={visibleCount}
              onCheckAll={checkAll}
              onUncheckAll={uncheckAll}
            />
          )}
          <CopyButton
            checklist={activeList}
            includeArchived={includeArchivedInCopy}
          />
          {sync && (
            <SyncStatus
              providerName={sync.providerName}
              status={sync.status}
              dirty={sync.dirty}
              offline={sync.offline}
              onOpenDetails={sync.onOpenDetails}
            />
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 [overscroll-behavior:contain] overflow-y-auto pb-24 sm:pb-0"
      >
        {addItemPosition === "top" && draftRow}
        {items.length === 0 ? (
          !inline && (
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
                  onAddAfter={composer.startAfter}
                  onAddChild={composer.startChild}
                  autoEditBody={item.id === editBodyOfId}
                  onAutoEditConsumed={clearEditBody}
                  autoEditTitle={item.id === editTitleOfId}
                  onAutoEditTitleConsumed={clearEditTitle}
                  onActiveEditorChange={setEditorActive}
                  notesDisabled={disableItemNotes}
                  capitalizeItems={capitalizeItems}
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
              // Splice the in-list composer in after the row it sits below.
              if (inListDraft && i === inListDraft.spliceIndex - 1)
                out.push(inListDraftRow);
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

      {!active && !editingId && (
        <AddItemButton
          onActivate={composer.startInline}
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

      <ArchivedDrawer
        open={archiveDrawerOpen}
        onClose={closeArchiveDrawer}
        listName={activeName}
        items={archivedForActive}
        onRestore={unarchive}
        onDelete={remove}
      />
    </div>
  );
}

export const ChecklistView = memo(ChecklistViewImpl);
