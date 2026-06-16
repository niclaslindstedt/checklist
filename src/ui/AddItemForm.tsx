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

export function AddItemForm({
  onAdd,
  onClose,
}: {
  onAdd: (title: string) => void;
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
      <span aria-hidden className="text-lg leading-none text-muted">
        +
      </span>
      <ClearableInput
        ref={inputRef}
        value={value}
        onValueChange={setValue}
        onBlur={() => {
          const trimmed = value.trim();
          if (trimmed) onAdd(trimmed);
          onClose();
        }}
        placeholder={t("app.addItemPlaceholder")}
        aria-label={t("app.addItem")}
        wrapperClassName="flex-1"
      />
    </form>
  );
}
