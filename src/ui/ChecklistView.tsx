import { memo } from "react";

import { BUILD_LABEL } from "../build-env.ts";
import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { AddItemForm } from "./AddItemForm.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { useListReorder } from "./hooks/useListReorder.ts";
import { CogIcon } from "./icons.tsx";

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
}: Props) {
  const reorder = useListReorder(onReorder);
  const t = useT();

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pt-6 pb-[env(safe-area-inset-bottom)]">
      <header className="mb-2 flex items-center justify-between border-b border-line px-1 pb-3">
        <h1 className="flex items-baseline gap-2 text-lg font-semibold tracking-wide text-fg-bright">
          {t("app.title")}
          <span className="text-[0.6rem] font-normal tracking-normal text-muted tabular-nums">
            {BUILD_LABEL}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted tabular-nums">
            {checkedCount}/{items.length}
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t("app.openSettings")}
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
          >
            <CogIcon className="h-5 w-5" />
          </button>
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
