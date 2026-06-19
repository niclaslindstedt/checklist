import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { ChecklistRowEditor } from "./ChecklistRowEditor.tsx";
import { Checkbox } from "./form/index.ts";
import type { DragHandleProps } from "./hooks/useListReorder.ts";
import { useRowSwipe } from "./hooks/useRowSwipe.ts";
import { ChevronDownIcon, GripIcon } from "./icons.tsx";
import { renderMarkdown } from "./markdown/renderMarkdown.tsx";

// One checklist line. Two action layers sit behind a sliding foreground:
// swiping the foreground right uncovers Archive (and triggers it past the
// threshold), swiping left latches open to reveal the Delete button. A grip
// handle on the trailing edge starts a vertical drag-to-reorder instead.
//
// Text editing follows a reveal-then-edit model:
//   • An item with a body shows a chevron to the right of its title. Tapping
//     the title (or the chevron) expands the body, rendered as markdown.
//   • While expanded, tapping the title edits the **title**; tapping the body
//     edits the **body**; tapping anywhere outside the row collapses it.
//   • An item with no body goes straight into the editor on a title tap,
//     where "Add note" / Shift+Enter adds one.
// The editor (`ChecklistRowEditor`) shows the title and body as raw plain
// text; the row renders the body back as markdown once the edit commits.
//
// When the user switches item notes off (Settings → Lists, `notesDisabled`),
// the row is title-only: the chevron and rendered body never appear and the
// editor drops its note field. Any note already on the item is left in the
// document untouched, so flipping the setting back on reveals it again.
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
  /**
   * Delete this item because the user emptied it out — committed with a blank
   * title and no body, or backspaced past the start of an empty line. Lets the
   * row vanish silently instead of persisting a blank line.
   */
  onRemoveEmpty?: (id: string) => void;
  /**
   * Backspace at the start of an emptied line: remove this item and move
   * editing into the line above. Returns true when there was a line above to
   * back up into (so the editor swallows the key), false at the top of the
   * list.
   */
  onBackspaceEmpty?: (id: string) => boolean;
  /** Open a fresh add-item draft — fired when Enter commits a title edit. */
  onAddAfter?: () => void;
  /**
   * Open this row straight into its body editor as soon as it mounts — the
   * composer sets it on the row it just created via Shift+Enter so a new
   * item flows on into editing its note. Cleared through `onAutoEditConsumed`
   * once acted on, so it fires exactly once.
   */
  autoEditBody?: boolean;
  /** Tell the parent the auto body-edit has been consumed; clears the flag. */
  onAutoEditConsumed?: () => void;
  /**
   * Open this row straight into its title editor (cursor at the end) as soon
   * as it mounts — set on the line above when a backspace erases the line
   * below, so editing flows up the list. Cleared via `onAutoEditTitleConsumed`.
   */
  autoEditTitle?: boolean;
  /** Tell the parent the auto title-edit has been consumed; clears the flag. */
  onAutoEditTitleConsumed?: () => void;
  /** When set, item notes are switched off — render the row title-only. */
  notesDisabled?: boolean;
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
  onRemoveEmpty,
  onBackspaceEmpty,
  onAddAfter,
  autoEditBody = false,
  onAutoEditConsumed,
  autoEditTitle = false,
  onAutoEditTitleConsumed,
  notesDisabled = false,
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
  const rowRef = useRef<HTMLLIElement>(null);
  // Notes switched off collapses the row to title-only: ignore any stored
  // body so the chevron, reveal, and rendered markdown never show.
  const hasBody = Boolean(item.notes) && !notesDisabled;

  const enterEdit = useCallback((focusBody: boolean) => {
    setEditFocusBody(focusBody);
    setEditing(true);
  }, []);

  // The composer just created this item with Shift+Enter and wants it opened
  // straight into its body editor. Honour it once, then tell the parent it's
  // been consumed so it doesn't re-open on a later render. Notes-off has no
  // body to edit, so it's ignored there.
  useEffect(() => {
    if (!autoEditBody || notesDisabled) return;
    enterEdit(true);
    onAutoEditConsumed?.();
  }, [autoEditBody, notesDisabled, enterEdit, onAutoEditConsumed]);

  // A backspace erased the line below this one and asked us to take over: open
  // straight into the title editor (cursor at the end, set by the editor's own
  // mount focus) so the user keeps erasing up the list. Consumed once.
  useEffect(() => {
    if (!autoEditTitle) return;
    enterEdit(false);
    onAutoEditTitleConsumed?.();
  }, [autoEditTitle, enterEdit, onAutoEditTitleConsumed]);

  // Tapping the title: expand a collapsed body first (reveal), edit on the
  // next tap. A note-less item has nothing to reveal, so it edits straight
  // away.
  const onTitleTap = useCallback(() => {
    if (hasBody && !expanded) setExpanded(true);
    else enterEdit(false);
  }, [hasBody, expanded, enterEdit]);

  const submitEdit = useCallback(
    (fields: { title?: string; notes?: string }) => {
      // An item emptied of all its text shouldn't linger: when the title is
      // blank and no body remains (the field, if shown, or the stored note),
      // delete it instead of committing a blank line. `notes` is only present
      // when the body field was in play, so fall back to the stored note.
      const titleEmpty = !(fields.title ?? "").trim();
      const notesEmpty = !(fields.notes ?? item.notes ?? "").trim();
      if (titleEmpty && notesEmpty) {
        onRemoveEmpty?.(item.id);
        setEditing(false);
        return;
      }
      onEdit(item.id, fields);
      setEditing(false);
      // Leave the body revealed when it still has content, so the rendered
      // result is visible right after editing; collapse a cleared note.
      if (fields.notes !== undefined) setExpanded(Boolean(fields.notes.trim()));
    },
    [onEdit, onRemoveEmpty, item.id, item.notes],
  );

  // While the body is revealed, a tap anywhere outside the row collapses it.
  useEffect(() => {
    if (!expanded || editing) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded, editing]);

  if (editing) {
    return (
      <li
        ref={rowRef}
        data-reorder-id={item.id}
        style={style}
        className="relative border-b border-line bg-surface-2"
      >
        <ChecklistRowEditor
          item={item}
          focusBody={editFocusBody}
          notesDisabled={notesDisabled}
          onToggle={() => onToggle(item.id)}
          onSubmit={submitEdit}
          onAddAfter={onAddAfter}
          onBackspaceEmpty={
            onBackspaceEmpty ? () => onBackspaceEmpty(item.id) : undefined
          }
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      ref={rowRef}
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
          <Checkbox
            checked={item.checked}
            onChange={() => onToggle(item.id)}
            ariaLabel={item.checked ? t("app.uncheck") : t("app.check")}
          />
          <button
            type="button"
            onClick={onTitleTap}
            aria-label={t("app.editItem")}
            aria-expanded={hasBody ? expanded : undefined}
            className={`min-w-0 flex-1 truncate text-left ${
              item.checked ? "text-muted line-through" : "text-fg"
            }`}
          >
            {item.title}
          </button>
          {hasBody && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? t("app.hideNote") : t("app.showNote")}
              aria-expanded={expanded}
              className="flex h-7 w-7 shrink-0 items-center justify-center text-muted hover:text-fg"
            >
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
          )}
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
          // Tapping the rendered body edits it (the second tap of the
          // reveal-then-edit flow); a tap on a link inside it still follows
          // the link rather than opening the editor.
          <div
            role="button"
            tabIndex={0}
            aria-label={t("app.editNote")}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest("a")) enterEdit(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                enterEdit(true);
              }
            }}
            className="-mt-1 ml-8 cursor-text pb-1 text-sm text-muted"
          >
            {renderMarkdown(item.notes!)}
          </div>
        )}
      </div>
    </li>
  );
}

export const ChecklistRow = memo(ChecklistRowImpl);
