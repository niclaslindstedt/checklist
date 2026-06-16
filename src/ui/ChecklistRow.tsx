import { memo, useCallback, type CSSProperties } from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { Checkbox } from "./form/index.ts";
import type { DragHandleProps } from "./hooks/useListReorder.ts";
import { useRowSwipe } from "./hooks/useRowSwipe.ts";
import { GripIcon } from "./icons.tsx";

// One checklist line. Two action layers sit behind a sliding foreground:
// swiping the foreground right uncovers Archive (and triggers it past the
// threshold), swiping left latches open to reveal the Delete button. A grip
// handle on the trailing edge starts a vertical drag-to-reorder instead.
//
// The callbacks take the item id (rather than being pre-bound by the
// parent) so the parent can pass referentially stable handlers; paired
// with the `memo` wrapper below, that means an edit re-renders only the
// row whose `item` actually changed instead of every row in the list.

type Props = {
  item: ChecklistItem;
  onToggle: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  dragHandleProps: DragHandleProps;
  dragging: boolean;
  style?: CSSProperties;
};

function ChecklistRowImpl({
  item,
  onToggle,
  onArchive,
  onDelete,
  dragHandleProps,
  dragging,
  style,
}: Props) {
  const archive = useCallback(() => onArchive(item.id), [onArchive, item.id]);
  const swipe = useRowSwipe(archive);
  const t = useT();

  return (
    <li
      data-reorder-id={item.id}
      style={style}
      className="relative overflow-hidden border-b border-line"
    >
      {/* Archive — uncovered by swiping the row right. */}
      <div className="absolute inset-0 flex items-center justify-start bg-surface-2 pl-4 text-xs font-semibold tracking-wide text-muted uppercase">
        {t("app.archive")}
      </div>

      {/* Delete — uncovered by swiping the row left. */}
      <div className="absolute inset-0 flex items-center justify-end">
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="h-full w-24 bg-danger text-xs font-semibold tracking-wide text-white uppercase"
        >
          {t("app.delete")}
        </button>
      </div>

      {/* Sliding foreground. */}
      <div
        {...swipe.handlers}
        style={{ transform: `translateX(${swipe.offset}px)` }}
        className={`relative flex min-h-11 items-center gap-3 px-[var(--density-row-px)] py-[var(--density-row-py)] [touch-action:pan-y] ${
          dragging ? "bg-surface-2" : "bg-page-bg"
        } ${swipe.animating ? "transition-transform duration-200" : ""}`}
      >
        <Checkbox
          checked={item.checked}
          onChange={() => onToggle(item.id)}
          ariaLabel={item.checked ? t("app.uncheck") : t("app.check")}
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
          aria-label={t("app.dragToReorder")}
          {...dragHandleProps}
          className="-mr-1 flex shrink-0 cursor-grab touch-none items-center justify-center p-1 text-muted"
        >
          <GripIcon className="h-5 w-5" />
        </button>
      </div>
    </li>
  );
}

export const ChecklistRow = memo(ChecklistRowImpl);
