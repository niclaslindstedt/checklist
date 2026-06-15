import type { ChecklistItem } from "../domain/types.ts";
import { AddItemForm } from "./AddItemForm.tsx";
import { ChecklistRow } from "./ChecklistRow.tsx";
import { CogIcon } from "./icons.tsx";

// Presentational shell for the checklist: a quiet, monospaced, single
// column reminiscent of a plain-text editor. Purely props-driven — App
// owns the state hook and passes data plus callbacks down, so nothing in
// ui/ reaches back into app/.

type Props = {
  items: ChecklistItem[];
  checkedCount: number;
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onArchive: (id: string) => void;
  onOpenSettings: () => void;
};

export function ChecklistView({
  items,
  checkedCount,
  onAdd,
  onToggle,
  onRemove,
  onArchive,
  onOpenSettings,
}: Props) {
  return (
    <div className="mx-auto flex min-h-[100svh] max-w-2xl flex-col px-4 pt-6 pb-6">
      <header className="mb-2 flex items-center justify-between border-b border-line px-1 pb-3">
        <h1 className="text-lg font-semibold tracking-wide text-fg-bright">
          checklist
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted tabular-nums">
            {checkedCount}/{items.length}
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
          >
            <CogIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm text-muted">
          Nothing here yet — add your first item below.
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              onToggle={() => onToggle(item.id)}
              onArchive={() => onArchive(item.id)}
              onDelete={() => onRemove(item.id)}
            />
          ))}
        </ul>
      )}

      <AddItemForm onAdd={onAdd} />
    </div>
  );
}
