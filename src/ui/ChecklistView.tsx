import { memo, useCallback, useState } from "react";

import { useT } from "../i18n";
import { AddItemButton } from "./AddItemButton.tsx";
import { AddItemForm } from "./AddItemForm.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { ChecklistTitle } from "./ChecklistTitle.tsx";
import { CopyButton } from "./CopyButton.tsx";
import { SyncStatus } from "./SyncStatus.tsx";
import { TrophyButton } from "./achievements/TrophyButton.tsx";
import { useChecklistContext } from "./checklist-context.ts";
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
    checkedCount,
    addItem,
    importItems,
    editItem,
    toggle,
    remove,
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
  } = useChecklistContext();
  const reorderCtl = useListReorder(reorder);
  const t = useT();
  const activeName =
    checklists.find((c) => c.id === activeChecklistId)?.name ?? t("app.title");

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
  const addItemAndEditBody = useCallback(
    (title: string) => {
      const id = addItem(title);
      if (id) setEditBodyOfId(id);
      // Close the composer — focus moves to the new row's body field.
      setDrafting(false);
    },
    [addItem],
  );

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
          <span className="text-sm text-muted tabular-nums">
            {checkedCount}/{items.length}
          </span>
          <CopyButton checklist={activeList} />
          <TrophyButton />
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
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onToggle={toggle}
                onArchive={archive}
                onDelete={remove}
                onEdit={editItem}
                onAddAfter={startDraft}
                autoEditBody={item.id === editBodyOfId}
                onAutoEditConsumed={clearEditBody}
                notesDisabled={disableItemNotes}
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
    </div>
  );
}

export const ChecklistView = memo(ChecklistViewImpl);
