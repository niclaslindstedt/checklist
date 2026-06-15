import { memo, type CSSProperties } from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { usePwaUpdate } from "../pwa/usePwaUpdate.ts";
import { AddItemForm } from "./AddItemForm.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { HeaderMenu } from "./HeaderMenu.tsx";
import { useListReorder } from "./hooks/useListReorder.ts";

// Presentational shell for the checklist: a quiet, monospaced, single
// column reminiscent of a plain-text editor. Purely props-driven — App
// owns the state hook and passes data plus callbacks down, so nothing in
// ui/ reaches back into app/.
//
// The shell is pinned to the viewport (the document itself never scrolls);
// only the item list scrolls internally, which keeps the header and composer
// in view and stops iOS Safari from rubber-banding a near-empty list.

type Props = {
  items: ChecklistItem[];
  checkedCount: number;
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onArchive: (id: string) => void;
  onReorder: (id: string, toIndex: number) => void;
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
};

// Memoised: App holds appearance settings alongside the checklist, so
// every settings edit (a color-swatch drag fires `onChange` continuously)
// re-renders App. Theme is applied as CSS vars on `:root`, not through
// these props, so when only settings change every prop here is a stable
// reference and `memo` skips the whole list instead of reconciling N rows.
function ChecklistViewImpl({
  items,
  checkedCount,
  onAdd,
  onToggle,
  onRemove,
  onArchive,
  onReorder,
  onOpenSettings,
  onOpenChangelog,
}: Props) {
  const reorder = useListReorder(onReorder);
  const t = useT();
  // While a new build's service worker downloads, fill the "checklist"
  // wordmark with the accent colour from the bottom — a vertical power
  // bar; `progress` is null when no update is in flight (see usePwaUpdate).
  const { progress: pwaProgress } = usePwaUpdate();

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <header className="mb-2 flex items-center justify-between border-b border-line px-1 pb-3">
        <h1 className="text-lg font-semibold tracking-wide text-fg-bright">
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
          <HeaderMenu
            onOpenSettings={onOpenSettings}
            onOpenChangelog={onOpenChangelog}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 [overscroll-behavior:contain] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">
            {t("app.empty")}
          </p>
        ) : (
          <ul ref={reorder.containerRef} className="m-0 list-none p-0">
            {items.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                onToggle={() => onToggle(item.id)}
                onArchive={() => onArchive(item.id)}
                onDelete={() => onRemove(item.id)}
                dragHandleProps={reorder.dragHandleProps(item.id)}
                dragging={reorder.draggingId === item.id}
                style={reorder.rowStyle(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <AddItemForm onAdd={onAdd} />
    </div>
  );
}

export const ChecklistView = memo(ChecklistViewImpl);
