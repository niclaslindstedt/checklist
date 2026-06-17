import { useEffect, useRef, useState } from "react";

import { useT } from "../i18n";
import { ClearableInput } from "./form/index.ts";

// The composer: the inline draft row opened by the floating add button
// (`AddItemButton`). It renders where the new item will land — styled like
// a real `ChecklistRow` so the spot reads as the item being created — and
// grabs focus so the soft keyboard comes straight up.
//
// Submitting (Enter) adds the item and clears the field while keeping
// focus, so several can be jotted in a row. Blurring commits whatever was
// typed and closes; blurring an empty field just closes — an empty draft
// is never added, so the list never persists a blank item.
//
// Paste a markdown checklist (one or many `- [ ]` / `- [x]` / `- ` lines)
// into the field and it's imported as fresh items instead of landing as
// literal text — `onImport` parses it, appends the items to the current
// list, and returns how many it added; a zero means the paste wasn't a
// checklist, so the default paste proceeds untouched.

export function AddItemForm({
  onAdd,
  onImport,
  onClose,
}: {
  onAdd: (title: string) => void;
  onImport: (markdown: string) => number;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      className="flex min-h-11 items-center gap-3 border-b border-line px-[var(--density-row-px)] py-[var(--density-row-py)]"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setValue("");
        inputRef.current?.focus();
      }}
    >
      {/* Sized to match the checkbox in `ChecklistRow` (h-5 w-5) so the
          glyph sits centred above the checkbox column and the input text
          lines up with the item titles below. */}
      <span
        aria-hidden
        className="flex h-5 w-5 shrink-0 items-center justify-center text-lg leading-none text-muted"
      >
        +
      </span>
      <ClearableInput
        ref={inputRef}
        value={value}
        onValueChange={setValue}
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
