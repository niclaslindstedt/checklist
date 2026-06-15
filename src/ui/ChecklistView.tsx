import type { ChecklistItem } from "../domain/types.ts";
import { AddItemForm } from "./AddItemForm.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
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
};

export function ChecklistView({
  items,
  checkedCount,
  onAdd,
  onToggle,
  onRemove,
  onArchive,
  onReorder,
}: Props) {
  const reorder = useListReorder(onReorder);

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 pt-6 pb-[env(safe-area-inset-bottom)]">
      <header className="mb-2 flex items-baseline justify-between border-b border-line px-1 pb-3">
        <h1 className="text-lg font-semibold tracking-wide text-fg-bright">
          checklist
        </h1>
        <span className="text-sm text-muted tabular-nums">
          {checkedCount}/{items.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 [overscroll-behavior:contain] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">
            Nothing here yet — add your first item below.
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
