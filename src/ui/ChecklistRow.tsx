import { memo, useCallback, useState, type CSSProperties } from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { ChecklistRowEditor } from "./ChecklistRowEditor.tsx";
import { Checkbox } from "./form/index.ts";
import type { DragHandleProps } from "./hooks/useListReorder.ts";
import { useRowSwipe } from "./hooks/useRowSwipe.ts";
import { ChevronDownIcon, GripIcon, PlusIcon } from "./icons.tsx";
import { renderMarkdown } from "./markdown/renderMarkdown.tsx";

// One checklist line. Two action layers sit behind a sliding foreground:
// swiping the foreground right uncovers Archive (and triggers it past the
// threshold), swiping left latches open to reveal the Delete button. A grip
// handle on the trailing edge starts a vertical drag-to-reorder instead.
//
// Pressing the item's text swaps the foreground for an in-place editor
// (`ChecklistRowEditor`): the title and an optional markdown body become
// plain-text fields. An item that carries a body shows a chevron on its
// leading edge that expands the body, rendered as markdown; an item with no
// body shows a "+" there that opens the editor straight onto the note field.
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
  onEdit: (id: string, fields: { title?: string; notes?: string }) => void;
  dragHandleProps: DragHandleProps;
  dragging: boolean;
  style?: CSSProperties;
};

function ChecklistRowImpl({
  item,
  onToggle,
  onArchive,
  onDelete,
  onEdit,
  dragHandleProps,
  dragging,
  style,
}: Props) {
  const archive = useCallback(() => onArchive(item.id), [onArchive, item.id]);
  const swipe = useRowSwipe(archive);
  const t = useT();

  const [editing, setEditing] = useState(false);
  const [editFocusBody, setEditFocusBody] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const hasBody = Boolean(item.notes);

  const enterEdit = useCallback((focusBody: boolean) => {
    setEditFocusBody(focusBody);
    setEditing(true);
  }, []);

  const submitEdit = useCallback(
    (fields: { title?: string; notes?: string }) => {
      onEdit(item.id, fields);
      setEditing(false);
    },
    [onEdit, item.id],
  );

  if (editing) {
    return (
      <li
        data-reorder-id={item.id}
        style={style}
        className="relative border-b border-line bg-page-bg"
      >
        <ChecklistRowEditor
          item={item}
          focusBody={editFocusBody}
          onSubmit={submitEdit}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      data-reorder-id={item.id}
      style={style}
      className="relative overflow-hidden border-b border-line"
    >
      {/* Archive — uncovered by swiping the row right. Hidden unless the
          foreground is sliding right so the archive slide-off never bares
          the trailing edge. */}
      <div
        aria-hidden={swipe.offset <= 0}
        className={`absolute inset-0 flex items-center justify-start bg-surface-2 pl-4 text-xs font-semibold tracking-wide text-muted uppercase ${
          swipe.offset > 0 ? "" : "invisible"
        }`}
      >
        {t("app.archive")}
      </div>

      {/* Delete — uncovered by swiping the row left. Kept hidden while the
          row slides right to archive so the right-aligned button is never
          exposed as the foreground clears the row. */}
      <div
        aria-hidden={swipe.offset >= 0}
        className={`absolute inset-0 flex items-center justify-end ${
          swipe.offset < 0 ? "" : "invisible"
        }`}
      >
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
        className={`relative flex flex-col px-[var(--density-row-px)] py-[var(--density-row-py)] [touch-action:pan-y] ${
          dragging ? "bg-surface-2" : "bg-page-bg"
        } ${swipe.animating ? "transition-transform duration-200" : ""}`}
      >
        <div className="flex min-h-11 items-center gap-3">
          {hasBody ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? t("app.hideNote") : t("app.showNote")}
              onClick={() => setExpanded((v) => !v)}
              className="flex h-5 w-5 shrink-0 items-center justify-center text-muted hover:text-fg"
            >
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform ${
                  expanded ? "" : "-rotate-90"
                }`}
              />
            </button>
          ) : (
            <button
              type="button"
              aria-label={t("app.addNote")}
              onClick={() => enterEdit(true)}
              className="flex h-5 w-5 shrink-0 items-center justify-center text-muted/60 hover:text-fg"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          )}
          <Checkbox
            checked={item.checked}
            onChange={() => onToggle(item.id)}
            ariaLabel={item.checked ? t("app.uncheck") : t("app.check")}
          />
          <button
            type="button"
            onClick={() => enterEdit(false)}
            aria-label={t("app.editItem")}
            className={`min-w-0 flex-1 truncate text-left ${
              item.checked ? "text-muted line-through" : "text-fg"
            }`}
          >
            {item.title}
          </button>
          <button
            type="button"
            aria-label={t("app.dragToReorder")}
            {...dragHandleProps}
            className="-mr-1 flex shrink-0 cursor-grab touch-none items-center justify-center p-1 text-muted"
          >
            <GripIcon className="h-5 w-5" />
          </button>
        </div>

        {hasBody && expanded && (
          <div className="ml-8 pb-1 text-sm text-muted">
            {renderMarkdown(item.notes!)}
          </div>
        )}
      </div>
    </li>
  );
}

export const ChecklistRow = memo(ChecklistRowImpl);
