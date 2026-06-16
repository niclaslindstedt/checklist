import { memo, type CSSProperties } from "react";

import { useT } from "../i18n";
import { usePwaUpdate } from "../pwa/usePwaUpdate.ts";
import { AddItemForm } from "./AddItemForm.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { SyncStatus } from "./SyncStatus.tsx";
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
  const { items, checkedCount, addItem, toggle, remove, archive, reorder, sync } =
    useChecklistContext();
  const reorderCtl = useListReorder(reorder);
  const t = useT();
  // While a new build's service worker downloads, fill the "checklist"
  // wordmark with the accent colour from the bottom — a vertical power
  // bar; `progress` is null when no update is in flight (see usePwaUpdate).
  const { progress: pwaProgress } = usePwaUpdate();

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <header className="mb-2 flex items-center justify-between border-b border-line px-1 pb-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-wide text-fg-bright">
          <img
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
            aria-hidden
            className="h-6 w-6 rounded"
          />
          <span
            className={pwaProgress === null ? undefined : "pwa-title-fill"}
            style={
              pwaProgress === null
                ? undefined
                : ({ "--pwa-fill": String(pwaProgress) } as CSSProperties)
            }
            title={
              pwaProgress === null
                ? undefined
                : t("pwa.downloading", { percent: String(pwaProgress) })
            }
          >
            {t("app.title")}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted tabular-nums">
            {checkedCount}/{items.length}
          </span>
          {sync && (
            <SyncStatus
              providerName={sync.providerName}
              status={sync.status}
              dirty={sync.dirty}
              onSave={sync.onSave}
              onOpenDetails={sync.onOpenDetails}
            />
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 [overscroll-behavior:contain] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">
            {t("app.empty")}
          </p>
        ) : (
          <ul ref={reorderCtl.containerRef} className="m-0 list-none p-0">
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onToggle={toggle}
                onArchive={archive}
                onDelete={remove}
                dragHandleProps={reorderCtl.dragHandleProps(item.id)}
                dragging={reorderCtl.draggingId === item.id}
                style={reorderCtl.rowStyle(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <AddItemForm onAdd={addItem} />
    </div>
  );
}

export const ChecklistView = memo(ChecklistViewImpl);
