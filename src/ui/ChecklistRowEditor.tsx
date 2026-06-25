import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { Checkbox, focusAtEnd } from "./form/index.ts";
import { PlusIcon } from "./icons.tsx";

// The in-place editor a checklist row swaps to when pressed. It keeps the
// row's checkbox so the line still reads as the same item, and edits its
// text as **plain text** — the title on one line, an optional markdown body
// beneath — so the raw markdown is what you see while typing; the row
// renders it back as markdown once the edit commits. The whole row is tinted
// (`bg-surface-2`, set by the parent) so it reads as the active edit.
//
// The fields are native `<input>` / `<textarea>`, so iOS draws its own
// keyboard accessory bar (the previous/next/Done bar above the keyboard) and
// that is the *only* bar on screen. (An earlier build used contenteditable to
// suppress that native bar in favour of an app-drawn one, but the suppression
// didn't hold in an installed iOS PWA — both bars showed at once — so the app
// leans on the native bar instead.)
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
// body, alongside Shift+Enter. Beside it, "Add sub-item" commits the edit and
// opens a composer nested under this item (`onAddChild`) — the no-drag way to
// grow the tree.

// The nearest ancestor that actually scrolls vertically — the checklist's
// `overflow-y-auto` list. Scrolling this directly (rather than letting the
// browser walk every scrollable ancestor) keeps the pinned header, which sits
// *outside* this container, from moving when an editor reveals itself.
function scrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

export function ChecklistRowEditor({
  item,
  onSubmit,
  onCancel,
  onToggle,
  onAddAfter,
  onAddChild,
  onBackspaceEmpty,
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
   * Commit the edit and open a sub-item composer nested under this item —
   * wired to the "Add sub-item" button so a checklist can grow its tree
   * without the drag-to-nest gesture. Omitted when nesting isn't offered.
   */
  onAddChild?: () => void;
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
  // True only when the body is revealed by tapping "Add a note" (not when the
  // editor opens with a body already showing), so the grow-in animation plays
  // on that reveal but never on first mount.
  const [revealAnimate, setRevealAnimate] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
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

  // Bring the row being edited into view above the soft keyboard by scrolling
  // *only* the list's own scroll container — never `scrollIntoView`, which
  // also scrolls the window / visual viewport and so drags the pinned header
  // (the title and menu buttons) along with it, a 20-30px jump every time an
  // editor opens. We move the container the minimum needed, and only when the
  // editor is actually clipped, so a row that's already on screen (e.g. when
  // Backspace hands editing to the line above) doesn't move at all. The shell
  // is pinned to the visual viewport (`useViewportHeight`), so the container's
  // own bottom edge already sits above the keyboard; aligning the editor to it
  // clears the keyboard. Re-run on visual-viewport resize so the keyboard's
  // appearance still lifts a now-hidden row.
  useEffect(() => {
    const reveal = () => {
      const node = rootRef.current;
      if (!node) return;
      const scroller = scrollParent(node);
      if (!scroller) return;
      const row = node.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (row.top < view.top) scroller.scrollTop -= view.top - row.top;
      else if (row.bottom > view.bottom)
        scroller.scrollTop += row.bottom - view.bottom;
    };
    const raf = requestAnimationFrame(reveal);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", reveal);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", reveal);
    };
  }, []);

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
    setRevealAnimate(true);
    requestAnimationFrame(() => focusAtEnd(bodyRef.current));
  };

  // Commit whatever's been typed, then hand off to the parent so a sub-item
  // composer opens nested under this item — the title edit lands first so the
  // user's last keystrokes aren't dropped on the way into the new draft.
  const addChild = () => {
    submit();
    onAddChild?.();
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
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

  const onBodyKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
      ref={rootRef}
      onBlur={onBlur}
      className="flex flex-col gap-1.5 px-[var(--density-row-px)] py-[var(--density-row-py)]"
    >
      <div
        className={`flex items-center gap-3 ${bodyShown ? "min-h-7" : "min-h-11"}`}
      >
        {/* Empty disclosure-caret slot, matching the view row, so the editor's
            checkbox and title line up with every other row instead of sliding
            left. */}
        <span className="flex w-5 shrink-0 items-center justify-center" />
        <Checkbox
          checked={item.checked}
          onChange={onToggle}
          ariaLabel={item.checked ? t("app.uncheck") : t("app.check")}
          // Keep the press from blurring the open title field (which would
          // commit and close the editor before the toggle lands).
          onMouseDown={(e) => e.preventDefault()}
        />
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onTitleKey}
          placeholder={t("app.editTitlePlaceholder")}
          aria-label={t("app.editItem")}
          // Capitalise the first letter of the title. Each item is its own
          // sentence, so a fresh row should start capitalised even though the
          // previous one rarely ends in a period — and the hint must be set
          // explicitly: in an installed iOS PWA (WKWebView) the soft keyboard
          // doesn't reset its shift state when Enter commits a row and focus
          // jumps here programmatically, so it would otherwise keep the prior
          // field's lowercase state instead of capitalising this empty field.
          autoCapitalize="sentences"
          className="min-w-0 flex-1 border-0 bg-transparent text-fg-bright outline-none"
        />
      </div>
      {bodyShown && (
        // The wrapper clips the field during the grow-in reveal (see
        // `note-reveal` in theme.css); `ml-8` lines the note up under the title.
        <div
          className={`ml-8 overflow-hidden ${revealAnimate ? "animate-note-reveal" : ""}`}
        >
          <textarea
            ref={bodyRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onKeyDown={onBodyKey}
            placeholder={t("app.notePlaceholder")}
            aria-label={t("app.notePlaceholder")}
            autoCapitalize="sentences"
            className="max-h-72 min-h-32 w-full resize-none overflow-y-auto rounded-md border border-line bg-page-bg px-2 py-1.5 font-mono text-sm break-words text-fg outline-none focus:border-accent"
          />
        </div>
      )}
      {/* The affordance row beneath the title: "Add a note" (until the body is
          revealed or notes are off) and, to its right, "Add sub-item" which
          commits and opens a nested composer. Both keep the press inside the
          editor (mousedown preventDefault) so the blur-commit doesn't fire. */}
      {(onAddChild || (!bodyShown && !notesDisabled)) && (
        <div className="mb-1.5 ml-8 flex w-fit items-center gap-4 text-xs text-muted">
          {!bodyShown && !notesDisabled && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={revealBody}
              className="flex items-center gap-1 hover:text-fg"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t("app.addNote")}
            </button>
          )}
          {onAddChild && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={addChild}
              className="flex items-center gap-1 hover:text-fg"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              {t("app.addSubitem")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
