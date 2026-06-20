import { memo, useCallback, useMemo, useState } from "react";

import { unlock } from "../achievements/bus.ts";
import { findItem, flattenForDisplay } from "../domain/checklists.ts";
import { useT } from "../i18n";
import { AddItemButton } from "./AddItemButton.tsx";
import { AddItemForm } from "./AddItemForm.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { ChecklistTitle } from "./ChecklistTitle.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { EditNavBar } from "./EditNavBar.tsx";
import { ItemCount } from "./ItemCount.tsx";
import { SyncStatus } from "./SyncStatus.tsx";
import { useChecklistContext } from "./checklist-context.ts";
import type { ActiveEditor } from "./edit-nav.ts";
import { useListReorder } from "./hooks/useListReorder.ts";

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
    importItems,
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

  // The inline composer is only mounted while drafting: the add button opens
  // it, Enter / blur-with-text commits through `addItem`, and an empty blur
  // just unmounts it again — so a blank item is never created.
  const [drafting, setDrafting] = useState(false);
  const startDraft = useCallback(() => setDrafting(true), []);
  const closeDraft = useCallback(() => setDrafting(false), []);

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

  // The editor currently open, registered by its row. Drives the keyboard nav
  // bar: which item is being edited (so we can find the one above/below) and
  // the `commit` to flush its edit before jumping. Up/down reuse the same
  // `editTitleOfId` hand-off the Backspace-erase flow uses to move editing
  // between rows.
  const [activeEditor, setActiveEditor] = useState<ActiveEditor | null>(null);
  const editIndex = activeEditor
    ? rows.findIndex((r) => r.item.id === activeEditor.id)
    : -1;
  const canPrev = editIndex > 0;
  const canNext = editIndex >= 0 && editIndex < rows.length - 1;
  const moveEdit = (target: number) => {
    const targetId = rows[target]?.item.id;
    if (!activeEditor || !targetId) return;
    activeEditor.commit();
    setEditTitleOfId(targetId);
    unlock("lineWalker");
  };

  const draftRow = drafting ? (
    <AddItemForm
      onAdd={addItem}
      onAddWithBody={addItemAndEditBody}
      onImport={importItems}
      onClose={closeDraft}
      notesDisabled={disableItemNotes}
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
          <ul ref={reorderCtl.containerRef} className="m-0 list-none p-0">
            {rows.map(({ item, depth, hasChildren }) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onToggle={toggle}
                onArchive={archive}
                onDelete={remove}
                onEdit={editItem}
                onRemoveEmpty={removeEmpty}
                onBackspaceEmpty={backspaceEmpty}
                onAddAfter={startDraft}
                autoEditBody={item.id === editBodyOfId}
                onAutoEditConsumed={clearEditBody}
                autoEditTitle={item.id === editTitleOfId}
                onAutoEditTitleConsumed={clearEditTitle}
                onActiveEditorChange={setActiveEditor}
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
                style={reorderCtl.rowStyle(item.id)}
              />
            ))}
          </ul>
        )}
        {addItemPosition === "bottom" && draftRow}
      </div>

      {!drafting && (
        <AddItemButton
          onActivate={startDraft}
          onArchiveFinished={archiveFinished}
          onDeleteFinished={deleteFinished}
          finishedCount={checkedCount}
        />
      )}

      {activeEditor && (
        <EditNavBar
          canPrev={canPrev}
          canNext={canNext}
          onPrev={() => moveEdit(editIndex - 1)}
          onNext={() => moveEdit(editIndex + 1)}
          onDone={() => activeEditor.commit()}
        />
      )}
    </div>
  );
}

export const ChecklistView = memo(ChecklistViewImpl);
