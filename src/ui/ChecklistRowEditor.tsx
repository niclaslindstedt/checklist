import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { Checkbox, ContentEditable, focusAtEnd } from "./form/index.ts";
import { PlusIcon } from "./icons.tsx";

// The in-place editor a checklist row swaps to when pressed. It keeps the
// row's checkbox so the line still reads as the same item, and edits its
// text as **plain text** — the title on one line, an optional markdown body
// beneath — so the raw markdown is what you see while typing; the row
// renders it back as markdown once the edit commits. The whole row is tinted
// (`bg-surface-2`, set by the parent) so it reads as the active edit.
//
// Both fields are `ContentEditable` (a contenteditable div), not native
// input/textarea, on purpose: iOS shows its own form-assistant bar above the
// keyboard for native controls — a second up/down/done bar that duplicated the
// app's own keyboard nav bar (`EditNavBar`) and can't be hidden — but not for
// contenteditable elements. See `ContentEditable`.
//
// Commit / cancel mirror the add-item composer's feel:
//   • Enter in the title commits and immediately opens a fresh draft row
//     (`onAddAfter`) — same as tapping the add button — so several items
//     can be jotted in a row without leaving the keyboard.
//   • Shift+Enter reveals (and focuses) the body field so you can flesh the
//     item out instead of starting a new one.
//   • ⌘/Ctrl+Enter commits from the body (a bare Enter is a newline there).
//   • Escape cancels, leaving the item untouched.
//   • Blurring the whole editor commits whatever was typed, so an edit is
//     never lost to a stray tap elsewhere — but an editor left empty (no
//     title, no body) deletes its item instead, so a wiped-out line never
//     lingers (the parent's `onSubmit` makes that call).
//   • Backspace at the start of an emptied title hands off to `onBackspaceEmpty`
//     so the item is removed and editing backs up into the line above — keep
//     the key held and you walk up the list erasing lines as you go.
//
// The "Add note" affordance beneath the title is the second way into the
// body, alongside Shift+Enter.

export function ChecklistRowEditor({
  item,
  onSubmit,
  onCancel,
  onToggle,
  onAddAfter,
  onBackspaceEmpty,
  onActiveChange,
  focusBody = false,
  notesDisabled = false,
}: {
  item: ChecklistItem;
  onSubmit: (fields: { title?: string; notes?: string }) => void;
  onCancel: () => void;
  /** Toggle the item's checked state from the editor's checkbox. */
  onToggle: () => void;
  /**
   * Open a fresh add-item draft after committing — wired to Enter in the
   * title so finishing one item flows straight into the next, like tapping
   * the add button.
   */
  onAddAfter?: () => void;
  /**
   * Backspace was pressed at the start of an already-empty title (with no
   * body), so the user means to erase this line and back up into the one
   * above. Return true if the caller handled it (removed this item and moved
   * editing up) — the editor then swallows the keystroke and stands down so
   * the trailing unmount-blur doesn't fire a second outcome. Return false
   * (e.g. this is the top line, nothing above) to let the keypress fall
   * through untouched.
   */
  onBackspaceEmpty?: () => boolean;
  /**
   * Register (on mount) / clear (on unmount) a `commit` that persists the
   * editor's current title/body and closes it — the keyboard nav bar calls it
   * to flush a half-typed edit before jumping to a neighbouring item. See
   * `edit-nav.ts`.
   */
  onActiveChange?: (commit: (() => void) | null) => void;
  /** Open with the body field shown and focused (the "add a note" path). */
  focusBody?: boolean;
  /**
   * When set, item notes are switched off: the editor edits the title only,
   * hiding the body field and the "Add note" affordance and turning
   * Shift+Enter into a plain commit. Any stored note is left untouched.
   */
  notesDisabled?: boolean;
}) {
  const t = useT();
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [bodyShown, setBodyShown] = useState(
    !notesDisabled && (focusBody || Boolean(item.notes)),
  );
  const titleRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Guards the commit/cancel paths so a blur that trails an Escape (the
  // component is unmounting) doesn't fire a second, conflicting outcome.
  const done = useRef(false);

  useEffect(() => {
    if (focusBody && !notesDisabled) {
      focusAtEnd(bodyRef.current);
      return;
    }
    focusAtEnd(titleRef.current);
  }, [focusBody, notesDisabled]);

  // The body text the item would carry — the live field while it's shown,
  // else whatever note is stored (hidden when notes are off or collapsed).
  // Used to gate the "empty line" backspace so a hidden note is never lost.
  const bodyContent = () => (bodyShown ? notes : (item.notes ?? "")).trim();

  const submit = (addAfter = false) => {
    if (done.current) return;
    done.current = true;
    const fields: { title?: string; notes?: string } = { title };
    // Only carry the note when its field is in play, so editing just the
    // title never wipes a body the user didn't touch.
    if (bodyShown) fields.notes = notes;
    onSubmit(fields);
    // Enter chains straight into a new draft row; blur / ⌘-Enter just commit.
    if (addAfter) onAddAfter?.();
  };

  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  const revealBody = () => {
    setBodyShown(true);
    requestAnimationFrame(() => focusAtEnd(bodyRef.current));
  };

  // Expose a commit handle to the keyboard nav bar for as long as this editor
  // is mounted. It calls the *latest* `submit` through a ref so the handle
  // never persists stale text, and `submit()` (no `addAfter`) commits and
  // closes without chaining a fresh draft. Registered once on mount, cleared
  // on unmount, so the bar always points at the one open editor.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;
  useEffect(() => {
    onActiveChangeRef.current?.(() => submitRef.current());
    return () => onActiveChangeRef.current?.(null);
  }, []);

  const onTitleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Shift+Enter reveals the note field, unless notes are switched off —
      // then there's nothing to reveal, so it commits and chains a fresh
      // draft like a bare Enter.
      if (e.shiftKey && !notesDisabled) revealBody();
      else submit(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Backspace" && title === "" && !bodyContent()) {
      // Erasing an already-empty line: hand off so the item is removed and
      // editing backs up into the line above. If the caller takes it, swallow
      // the keystroke and stand down so the unmount-blur doesn't also commit.
      if (onBackspaceEmpty?.()) {
        e.preventDefault();
        done.current = true;
      }
    }
  };

  const onBodyKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    // Commit only when focus leaves the editor entirely — moving between the
    // title, body, and the add-note button keeps relatedTarget inside.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    submit();
  };

  return (
    <div
      onBlur={onBlur}
      className="flex flex-col gap-1.5 px-[var(--density-row-px)] py-[var(--density-row-py)]"
    >
      <div
        className={`flex items-center gap-3 ${bodyShown ? "min-h-7" : "min-h-11"}`}
      >
        <Checkbox
          checked={item.checked}
          onChange={onToggle}
          ariaLabel={item.checked ? t("app.uncheck") : t("app.check")}
        />
        <ContentEditable
          ref={titleRef}
          value={title}
          onChange={setTitle}
          onKeyDown={onTitleKey}
          placeholder={t("app.editTitlePlaceholder")}
          ariaLabel={t("app.editItem")}
          className="min-w-0 flex-1 border-0 bg-transparent break-words text-fg-bright outline-none"
        />
      </div>
      {bodyShown ? (
        <ContentEditable
          ref={bodyRef}
          value={notes}
          onChange={setNotes}
          onKeyDown={onBodyKey}
          multiline
          placeholder={t("app.notePlaceholder")}
          ariaLabel={t("app.notePlaceholder")}
          className="max-h-72 min-h-32 overflow-y-auto rounded-md border border-line bg-page-bg px-2 py-1.5 font-mono text-sm break-words whitespace-pre-wrap text-fg outline-none focus:border-accent"
        />
      ) : (
        // With notes switched off there's no "Add note" path — the editor is
        // title-only.
        !notesDisabled && (
          <button
            type="button"
            // Keep the press inside the editor so the blur-commit doesn't fire.
            onMouseDown={(e) => e.preventDefault()}
            onClick={revealBody}
            className="ml-8 flex w-fit items-center gap-1 text-xs text-muted hover:text-fg"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {t("app.addNote")}
          </button>
        )
      )}
    </div>
  );
}
