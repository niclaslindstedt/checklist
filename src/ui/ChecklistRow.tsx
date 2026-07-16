import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type { DropMode } from "../domain/checklists.ts";
import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { ChecklistRowEditor } from "./ChecklistRowEditor.tsx";
import { DeadlineRow } from "./DeadlineRow.tsx";
import { Checkbox } from "./form/index.ts";
import type { DragHandleProps } from "./hooks/useListReorder.ts";
import { useRowSwipe } from "./hooks/useRowSwipe.ts";
import {
  CaretRightIcon,
  ClockIcon,
  GripIcon,
  NoteIcon,
  TrashIcon,
} from "./icons.tsx";
import { renderMarkdown } from "./markdown/renderMarkdown.tsx";

// Horizontal step per nesting level. A sub-item sits this much further right
// than its parent, so the tree shape reads at a glance. Exported so the drag
// ghost preview can indent itself to match the row it'll land beside.
export const INDENT_PER_LEVEL = 32;

// One checklist line. Two action layers sit behind a sliding foreground:
// swiping the foreground right uncovers Archive (and triggers it past the
// threshold), swiping left latches open to reveal the Delete button. A grip
// handle on the trailing edge starts a vertical drag-to-reorder instead.
//
// Text editing follows a reveal-then-edit model:
//   • An item with a body shows a note glyph to the right of its title. Tapping
//     the title (or the glyph) expands the body, rendered as markdown. The
//     glyph is muted while the body is hidden and paints in the accent colour
//     while it's revealed, so the row signals at a glance that it carries a note.
//   • While expanded, tapping the title edits the **title**; tapping the body
//     edits the **body**; tapping anywhere outside the row collapses it.
//   • An item with no body goes straight into the editor on a title tap,
//     where "Add note" / Shift+Enter adds one.
// The editor (`ChecklistRowEditor`) shows the title and body as raw plain
// text; the row renders the body back as markdown once the edit commits.
//
// When the user switches item notes off (Settings → Lists, `notesDisabled`),
// the row is title-only: the note glyph and rendered body never appear and the
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
   * Open the deadline modal for this item — fired by the clock button
   * revealed on a left swipe (and the desktop right-click menu). Sets or
   * clears the item's due date and recurrence.
   */
  onEditDeadline?: (id: string) => void;
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
  /**
   * Open an add-item draft positioned right below this row — fired when Enter
   * commits a title edit, so a new item lands directly under the one just
   * edited, at the same depth (a sibling, nested or top-level alike), instead
   * of jumping to the top or bottom of the list. Receives this row's id as the
   * anchor the new item is inserted after.
   */
  onAddAfter?: (afterId: string) => void;
  /**
   * Open a sub-item composer nested under the given item — fired by the
   * editor's "Add sub-item" button (`onAddChild(item.id)`). Omitted when
   * nesting isn't offered.
   */
  onAddChild?: (parentId: string) => void;
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
  /**
   * Report this row's editor opening (`active: true`) or closing
   * (`active: false`) so the view can hide the add button while a row is being
   * edited. The row id is always passed so the view can tell *which* row is
   * reporting: when editing moves straight from one row to another, the
   * outgoing row's close must not clear an active id the incoming row has
   * already claimed.
   */
  onActiveEditorChange?: (id: string, active: boolean) => void;
  /** When set, item notes are switched off — render the row title-only. */
  notesDisabled?: boolean;
  /** When set, the editor capitalises the first letter of the item title. */
  capitalizeItems?: boolean;
  /** Nesting depth — indents the row one step per level. */
  depth?: number;
  /** Whether the item has sub-items, so it shows the expand/collapse caret. */
  hasChildren?: boolean;
  /** Whether the sub-list is collapsed (children hidden). */
  collapsed?: boolean;
  /** Toggle the sub-list open/closed. */
  onToggleCollapse?: (id: string) => void;
  /**
   * When this row is the live drop target during a drag, how the dragged item
   * would land on it: `"into"` (become a sub-item) tints the whole row, while
   * `"before"` / `"after"` draw an insertion line on that edge. Null when the
   * row isn't the current target.
   */
  dropMode?: DropMode | null;
  dragHandleProps: DragHandleProps;
  dragging: boolean;
  style?: CSSProperties;
  /**
   * Desktop only — open the right-click actions menu (archive / delete) for
   * this row. When supplied the row drops its swipe-to-reveal gesture in
   * favour of the menu; touch viewports leave it unset and keep swiping.
   */
  onContextMenu?: (id: string, e: React.MouseEvent) => void;
};

function ChecklistRowImpl({
  item,
  onToggle,
  onArchive,
  onDelete,
  onEdit,
  onEditDeadline,
  onRemoveEmpty,
  onBackspaceEmpty,
  onAddAfter,
  onAddChild,
  autoEditBody = false,
  onAutoEditConsumed,
  autoEditTitle = false,
  onAutoEditTitleConsumed,
  onActiveEditorChange,
  notesDisabled = false,
  capitalizeItems = false,
  depth = 0,
  hasChildren = false,
  collapsed = false,
  onToggleCollapse,
  dropMode = null,
  dragHandleProps,
  dragging,
  style,
  onContextMenu,
}: Props) {
  const indent = depth * INDENT_PER_LEVEL;
  // A sub-item reads as a genuine child line: smaller title text and a smaller
  // checkbox square than its parent. The shrink is purely visual — the tap
  // padding and the row's min height stay put, so the touch target is unchanged.
  const nested = depth > 0;
  const archive = useCallback(() => onArchive(item.id), [onArchive, item.id]);
  const swipe = useRowSwipe(archive);
  const t = useT();
  // Desktop swaps the swipe-to-reveal gesture for the right-click menu: no
  // sliding foreground, no archive/delete reveal layers behind it.
  const desktop = Boolean(onContextMenu);

  const [editing, setEditing] = useState(false);
  const [editFocusBody, setEditFocusBody] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  // Notes switched off collapses the row to title-only: ignore any stored
  // body so the note glyph, reveal, and rendered markdown never show.
  const hasBody = Boolean(item.notes) && !notesDisabled;

  const enterEdit = useCallback((focusBody: boolean) => {
    setEditFocusBody(focusBody);
    setEditing(true);
  }, []);

  // Enter after committing a title edit opens the next draft right below this
  // row — a sibling at this row's own depth — so adding items walks straight
  // down the list from wherever the user is, top-level and sub-lists alike.
  const handleAddAfter = useCallback(() => {
    onAddAfter?.(item.id);
  }, [onAddAfter, item.id]);

  // Tell the view which item is being edited (or that editing has ended) so it
  // can hide the add button while the keyboard is up. Clears on unmount too, so
  // deleting the open row never leaves the button hidden.
  useEffect(() => {
    if (!editing) return;
    onActiveEditorChange?.(item.id, true);
    return () => onActiveEditorChange?.(item.id, false);
  }, [editing, item.id, onActiveEditorChange]);

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
        style={{ ...style, paddingLeft: indent || undefined }}
        className="relative border-b border-line bg-surface-2"
      >
        <ChecklistRowEditor
          item={item}
          focusBody={editFocusBody}
          notesDisabled={notesDisabled}
          capitalize={capitalizeItems}
          onToggle={() => onToggle(item.id)}
          onSubmit={submitEdit}
          onAddAfter={handleAddAfter}
          onAddChild={onAddChild ? () => onAddChild(item.id) : undefined}
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
      onContextMenu={desktop ? (e) => onContextMenu!(item.id, e) : undefined}
      className={`relative overflow-hidden border-b border-line ${
        dropMode === "into" ? "bg-accent/10 ring-2 ring-accent ring-inset" : ""
      }`}
    >
      {/* A drop *into* this row (nesting) tints it (the ring above) so the
          parent-to-be is obvious. Sibling drops (before / after) aren't drawn
          here: the ghost preview snaps into the gap at the exact landing spot,
          which for an "after" on a parent is below its whole subtree — a line
          on this row's edge would instead sit between the parent and its own
          children, reading wrong. The ghost is the single landing indicator. */}

      {/* Swipe-reveal action layers (touch only — desktop uses the right-click
          menu instead). Archive is uncovered by swiping right, delete by
          swiping left; each stays hidden unless the foreground slides its way
          so the off-axis action is never bared as the row clears. */}
      {!desktop && (
        <>
          <div
            aria-hidden={swipe.offset <= 0}
            className={`absolute inset-0 flex items-center justify-start bg-surface-2 pl-4 text-xs font-semibold tracking-wide text-muted uppercase ${
              swipe.offset > 0 ? "" : "invisible"
            }`}
          >
            {t("app.archive")}
          </div>

          <div
            aria-hidden={swipe.offset >= 0}
            className={`absolute inset-0 flex items-center justify-end ${
              swipe.offset < 0 ? "" : "invisible"
            }`}
          >
            {/* The trailing action buttons, uncovered by a left swipe: a clock
                to set a deadline and a trash to delete. Both hold focus on
                mousedown so a tap doesn't first blur an open editor elsewhere —
                that blur commits and closes the editor, reflows the list, and
                slides the button out from under the finger before the click
                lands, silently losing the action and leaving the row swiped
                open. Preventing the mousedown default keeps focus put until the
                click fires (mirrors the composer's suggestion rows and the row's
                own title tap). */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                // Slide the row shut as the deadline modal opens, so once it
                // closes (whether the date was set or cancelled) the row is
                // back in its resting position rather than stranded swiped
                // open over the clock / delete buttons.
                swipe.close();
                onEditDeadline?.(item.id);
              }}
              aria-label={t("app.setDeadline")}
              className="flex h-full w-16 items-center justify-center bg-surface-3 text-fg"
            >
              <ClockIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onDelete(item.id)}
              aria-label={t("app.delete")}
              className="flex h-full w-16 items-center justify-center bg-danger text-white"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </>
      )}

      {/* Foreground. On touch it slides over the action layers; on desktop it
          sits still (the menu replaces the gesture). */}
      <div
        {...(desktop ? {} : swipe.handlers)}
        style={{
          transform: desktop ? undefined : `translateX(${swipe.offset}px)`,
          paddingLeft: indent
            ? `calc(var(--density-row-px) + ${indent}px)`
            : undefined,
        }}
        className={`relative flex flex-col px-[var(--density-row-px)] py-[var(--density-row-py)] [touch-action:pan-y] ${
          dragging ? "bg-surface-2" : "bg-page-bg"
        } ${!desktop && swipe.animating ? "transition-transform duration-200" : ""}`}
      >
        {/* The slim, colour-coded date row above a dated item's title. */}
        {item.deadline && (
          <DeadlineRow deadline={item.deadline} recurrence={item.recurrence} />
        )}

        {/* The whole row line is a pointer target for editing: a click that
            isn't on one of the real controls (checkbox, caret, note glyph,
            grip, or the title button) edits the item, so tapping the dead space
            beside the text — the gaps and the vertical padding — opens the
            editor instead of just blurring an open one. Keyboard users reach
            the title button directly, so this enlargement needs no role. */}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
        <div
          className="flex min-h-11 items-center gap-3"
          // Keep tapping this row from blurring an editor already open on
          // another row: the blur commits that editor, which shrinks it (the
          // affordance row disappears) and slides every row below it up — so by
          // the time the trailing click fires, the tapped row has moved out
          // from under the finger and the tap misses, dropping the keyboard.
          // Preventing the mousedown default holds focus until the click lands
          // and opens this row, at which point its editor takes focus and the
          // previous one commits — focus moves field-to-field, so the keyboard
          // never disappears. Mirrors the editor `Checkbox`'s onMouseDown trick.
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button, label, input, a"))
              return;
            onTitleTap();
          }}
        >
          {/* Sub-item disclosure caret — a fixed slot so leaf rows still align
              their checkbox under a sibling that has one. */}
          <span className="flex w-5 shrink-0 items-center justify-center">
            {hasChildren && (
              <button
                type="button"
                onClick={() => onToggleCollapse?.(item.id)}
                aria-label={
                  collapsed ? t("app.showSubitems") : t("app.hideSubitems")
                }
                aria-expanded={!collapsed}
                className="flex h-7 w-5 items-center justify-center text-muted hover:text-fg"
              >
                <CaretRightIcon
                  className={`h-4 w-4 transition-transform ${
                    collapsed ? "" : "rotate-90"
                  }`}
                />
              </button>
            )}
          </span>
          {/* Pad the tap target out to ~40px without growing the visual box:
              the padding enlarges the clickable label and the matching negative
              margin pulls the layout back, so the checkbox still sits in the
              same spot and stays h-5/w-5 — easier to hit on touch. */}
          <Checkbox
            checked={item.checked}
            onChange={() => onToggle(item.id)}
            ariaLabel={item.checked ? t("app.uncheck") : t("app.check")}
            size={nested ? "sm" : "md"}
            className="p-2.5 -m-2.5"
          />
          <button
            type="button"
            onClick={onTitleTap}
            aria-label={t("app.editItem")}
            aria-expanded={hasBody ? expanded : undefined}
            // A title too long for one line wraps onto the next instead of
            // being clipped with an ellipsis; `break-words` also splits a
            // single unbroken run (a long URL or word) so it can't overflow
            // the row and shove the trailing glyphs off-screen.
            className={`min-w-0 flex-1 break-words text-left ${
              nested ? "text-sm" : ""
            } ${item.checked ? "text-muted line-through" : "text-fg"}`}
          >
            {item.title}
          </button>
          {hasBody && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? t("app.hideNote") : t("app.showNote")}
              aria-expanded={expanded}
              className={`flex h-7 w-7 shrink-0 items-center justify-center transition-colors ${
                expanded ? "text-accent" : "text-muted hover:text-fg"
              }`}
            >
              <NoteIcon className="h-4 w-4" />
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
            className={`-mt-1 ml-8 cursor-text pb-1 text-muted ${
              nested ? "text-xs" : "text-sm"
            }`}
          >
            {renderMarkdown(item.notes!)}
          </div>
        )}
      </div>
    </li>
  );
}

export const ChecklistRow = memo(ChecklistRowImpl);
