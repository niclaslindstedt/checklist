import { useState } from "react";

import { ClearableInput } from "./form/index.ts";

// The composer pinned under the list. Submitting (Enter) adds the item
// and clears the field while keeping focus, so the user can add several
// in a row. Reminiscent of jotting lines in a plain-text editor.

export function AddItemForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <form
      className="mt-3 flex items-center gap-3 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onAdd(value);
        setValue("");
      }}
    >
      <span aria-hidden className="text-lg leading-none text-muted">
        +
      </span>
      <ClearableInput
        value={value}
        onValueChange={setValue}
        placeholder="Add item…"
        aria-label="Add item"
        wrapperClassName="flex-1"
      />
    </form>
  );
}
