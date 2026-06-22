import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useT } from "../i18n";
import { INDENT_PER_LEVEL } from "./ChecklistRow.tsx";
import { ClearableInput } from "./form/index.ts";

// The composer: the inline draft row opened by the floating add button
// (`AddItemButton`). It renders where the new item will land — styled like
// a real `ChecklistRow` so the spot reads as the item being created — and
// grabs focus so the soft keyboard comes straight up.
//
// Submitting (Enter) adds the item and clears the field while keeping
// focus, so several can be jotted in a row. Shift+Enter instead adds the
// item and jumps straight into editing its body — mirroring the in-row
// editor, where Shift+Enter on the title reveals the note field — so a
// thought that needs more than a one-line title flows on without re-tapping
// the new row. Blurring commits whatever was typed and closes; blurring an
// empty field just closes — an empty draft is never added, so the list
// never persists a blank item.
//
// Paste a markdown checklist (one or many `- [ ]` / `- [x]` / `- ` lines)
// into the field and it's imported as fresh items instead of landing as
// literal text — `onImport` parses it, appends the items to the current
// list, and returns how many it added; a zero means the paste wasn't a
// checklist, so the default paste proceeds untouched.

export function AddItemForm({
  onAdd,
  onAddWithBody,
  onImport,
  onClose,
  notesDisabled = false,
  depth = 0,
}: {
  onAdd: (title: string) => void;
  /**
   * Shift+Enter: add the item and immediately open its body for editing.
   * No-op equivalent to `onAdd` when item notes are switched off.
   */
  onAddWithBody: (title: string) => void;
  onImport: (markdown: string) => number;
  onClose: () => void;
  /** When set, item notes are off — Shift+Enter falls back to a plain add. */
  notesDisabled?: boolean;
  /**
   * Nesting depth — indents the composer one step per level so a sub-item
   * draft lines up under the children it's adding to (mirrors `ChecklistRow`).
   * 0 (the default) is the top-level composer.
   */
  depth?: number;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when a commit has already fired (Shift+Enter, which closes the
  // composer) so the trailing blur doesn't add the same item a second time.
  const committed = useRef(false);
  const t = useT();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addAndContinue = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // Own the Enter key outright so the native form submit never double-fires
    // alongside this handler — `onSubmit` stays only as a non-keyboard path.
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    // Shift+Enter adds the item and hands off to editing its body; with notes
    // switched off there's no body to edit, so it falls through to a plain add.
    if (e.shiftKey && !notesDisabled) {
      committed.current = true;
      onAddWithBody(trimmed);
    } else {
      onAdd(trimmed);
      setValue("");
      inputRef.current?.focus();
    }
  };

  const indent = depth * INDENT_PER_LEVEL;

  return (
    <form
      style={
        indent
          ? { paddingLeft: `calc(var(--density-row-px) + ${indent}px)` }
          : undefined
      }
      className="flex min-h-11 items-center gap-3 border-b border-line px-[var(--density-row-px)] py-[var(--density-row-py)]"
      onSubmit={(e) => {
        e.preventDefault();
        addAndContinue();
      }}
    >
      {/* Mirror a `ChecklistRow`'s leading columns so the input text lands in
          the same column as the item titles below: the "+" fills the caret
          slot, and a dimmed, inert checkbox fills the checkbox slot — both
          sized h-5 w-5 like the row. The dimmed box previews where the new
          item's checkbox will sit once it's added. */}
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center text-lg leading-none text-muted"
      >
        +
      </span>
      <span
        aria-hidden
        className="h-5 w-5 shrink-0 rounded-sm border-2 border-muted opacity-40"
      />
      <ClearableInput
        ref={inputRef}
        value={value}
        onValueChange={setValue}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          // Hand the paste to the importer; a non-zero count means it was a
          // checklist and the items are already in, so swallow the default
          // paste and reset the field for the next entry.
          if (onImport(text) > 0) {
            e.preventDefault();
            setValue("");
            inputRef.current?.focus();
          }
        }}
        onBlur={() => {
          // Shift+Enter already committed and is closing the composer; don't
          // let the blur it triggers add the item again.
          if (committed.current) return;
          const trimmed = value.trim();
          if (trimmed) onAdd(trimmed);
          onClose();
        }}
        placeholder={t("app.addItemPlaceholder")}
        aria-label={t("app.addItem")}
        wrapperClassName="flex-1"
        // Match the checklist item title's colour exactly — only the bright
        // input default set it apart.
        textClassName="text-fg"
      />
    </form>
  );
}
