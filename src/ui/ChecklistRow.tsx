import type { CSSProperties } from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { Checkbox } from "./form/index.ts";
import type { DragHandleProps } from "./hooks/useListReorder.ts";
import { useRowSwipe } from "./hooks/useRowSwipe.ts";
import { GripIcon } from "./icons.tsx";

// One checklist line. Two action layers sit behind a sliding foreground:
// swiping the foreground right uncovers Archive (and triggers it past the
// threshold), swiping left latches open to reveal the Delete button. A grip
// handle on the trailing edge starts a vertical drag-to-reorder instead.

type Props = {
  item: ChecklistItem;
  onToggle: () => void;
  onArchive: () => void;
  onDelete: () => void;
  dragHandleProps: DragHandleProps;
  dragging: boolean;
  style?: CSSProperties;
};

export function ChecklistRow({
  item,
  onToggle,
  onArchive,
  onDelete,
  dragHandleProps,
  dragging,
  style,
}: Props) {
  const swipe = useRowSwipe(onArchive);

  return (
    <li
      data-reorder-id={item.id}
      style={style}
      className="relative overflow-hidden border-b border-line"
    >
      {/* Archive — uncovered by swiping the row right. */}
      <div className="absolute inset-0 flex items-center justify-start bg-surface-2 pl-4 text-xs font-semibold tracking-wide text-muted uppercase">
        Archive
      </div>

      {/* Delete — uncovered by swiping the row left. */}
      <div className="absolute inset-0 flex items-center justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="h-full w-24 bg-danger text-xs font-semibold tracking-wide text-white uppercase"
        >
          Delete
        </button>
      </div>

      {/* Sliding foreground. */}
      <div
        {...swipe.handlers}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className={`relative flex min-h-11 items-center gap-3 px-3 py-2 [touch-action:pan-y] ${
          dragging ? "bg-surface-2" : "bg-page-bg"
        } ${swipe.animating ? "transition-transform duration-200" : ""}`}
      >
        <Checkbox
          checked={item.checked}
          onChange={() => onToggle()}
          ariaLabel={item.checked ? "Uncheck item" : "Check item"}
        />
        <span
          className={`min-w-0 flex-1 truncate ${
            item.checked ? "text-muted line-through" : "text-fg"
          }`}
        >
          {item.title}
        </span>
        <button
          type="button"
          aria-label="Drag to reorder"
          {...dragHandleProps}
          className="-mr-1 flex shrink-0 cursor-grab touch-none items-center justify-center p-1 text-muted"
        >
          <GripIcon className="h-5 w-5" />
        </button>
      </div>
    </li>
  );
}
