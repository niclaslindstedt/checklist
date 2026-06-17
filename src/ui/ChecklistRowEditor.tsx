import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import type { ChecklistItem } from "../domain/types.ts";
import { useT } from "../i18n";
import { ChevronDownIcon, PlusIcon } from "./icons.tsx";

// The in-place editor a checklist row swaps to when pressed. It edits an
// item's text as **plain text** — the title on one line, an optional
// markdown body beneath — so the raw markdown is what you see while typing;
// the row renders it back as markdown once the edit commits.
//
// Commit / cancel mirror the add-item composer's feel:
//   • Enter in the title commits; Shift+Enter reveals (and focuses) the
//     body field so you can flesh the item out without leaving the keyboard.
//   • ⌘/Ctrl+Enter commits from the body (a bare Enter is a newline there).
//   • Escape cancels, leaving the item untouched.
//   • Blurring the whole editor commits whatever was typed, so an edit is
//     never lost to a stray tap elsewhere.
//
// The "+" / chevron button is the second way in to the body: pressing the
// "+" to the left of an item with no note opens straight into this editor
// with the body field revealed (see `ChecklistRow`).

export function ChecklistRowEditor({
  item,
  onSubmit,
  onCancel,
  focusBody = false,
}: {
  item: ChecklistItem;
  onSubmit: (fields: { title?: string; notes?: string }) => void;
  onCancel: () => void;
  /** Open with the body field shown and focused (the "add a note" path). */
  focusBody?: boolean;
}) {
  const t = useT();
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [bodyShown, setBodyShown] = useState(focusBody || Boolean(item.notes));
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Guards the commit/cancel paths so a blur that trails an Escape (the
  // component is unmounting) doesn't fire a second, conflicting outcome.
  const done = useRef(false);

  useEffect(() => {
    if (focusBody) {
      bodyRef.current?.focus();
      return;
    }
    const el = titleRef.current;
    el?.focus();
    const len = el?.value.length ?? 0;
    el?.setSelectionRange(len, len);
  }, [focusBody]);

  const submit = () => {
    if (done.current) return;
    done.current = true;
    const fields: { title?: string; notes?: string } = { title };
    // Only carry the note when its field is in play, so editing just the
    // title never wipes a body the user didn't touch.
    if (bodyShown) fields.notes = notes;
    onSubmit(fields);
  };

  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  const revealBody = () => {
    setBodyShown(true);
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) revealBody();
      else submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
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
    // title and body keeps the relatedTarget inside the container.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    submit();
  };

  return (
    <div
      onBlur={onBlur}
      className="flex flex-col gap-2 px-[var(--density-row-px)] py-[var(--density-row-py)]"
    >
      <div className="flex min-h-11 items-center gap-3">
        <button
          type="button"
          aria-label={bodyShown ? t("app.hideNote") : t("app.addNote")}
          // Keep the press inside the editor so the blur-commit doesn't fire.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (bodyShown ? setBodyShown(false) : revealBody())}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted hover:text-fg"
        >
          {bodyShown ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <PlusIcon className="h-4 w-4" />
          )}
        </button>
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onTitleKey}
          placeholder={t("app.editTitlePlaceholder")}
          aria-label={t("app.editItem")}
          className="min-w-0 flex-1 border-0 bg-transparent text-fg outline-none placeholder:text-muted"
        />
      </div>
      {bodyShown && (
        <textarea
          ref={bodyRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={onBodyKey}
          rows={Math.min(8, Math.max(2, notes.split("\n").length))}
          placeholder={t("app.notePlaceholder")}
          aria-label={t("app.notePlaceholder")}
          className="ml-8 resize-y rounded border border-line bg-surface-2 px-2 py-1 font-mono text-sm text-fg outline-none placeholder:text-muted"
        />
      )}
    </div>
  );
}
