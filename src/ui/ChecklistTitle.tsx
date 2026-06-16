import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useT } from "../i18n";
import { usePwaUpdate } from "../pwa/usePwaUpdate.ts";

// The header's checklist name — the wordmark slot beside the favicon. It
// shows the active checklist's name and doubles as the rename affordance:
// clicking it swaps in an inline text field (Enter / blur commits, Escape
// cancels). While a new build's service worker downloads, the name fills
// with the accent colour from the bottom as a vertical progress bar
// (`pwaProgress`, see usePwaUpdate) — the same treatment the wordmark
// carried before it became per-list.

export function ChecklistTitle({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const t = useT();
  const { progress: pwaProgress } = usePwaUpdate();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Select the whole name on entry so a quick retype replaces it outright.
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const next = inputRef.current?.value.trim() ?? "";
    if (next && next !== name) onRename(next);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        defaultValue={name}
        aria-label={t("app.renameChecklist")}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
        onBlur={commit}
        className="min-w-0 flex-1 border-b border-accent bg-transparent text-lg font-semibold tracking-wide text-fg-bright outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={
        pwaProgress === null
          ? t("app.renameChecklist")
          : t("pwa.downloading", { percent: String(pwaProgress) })
      }
      className={`min-w-0 cursor-pointer truncate text-left ${
        pwaProgress === null ? "" : "pwa-title-fill"
      }`}
      style={
        pwaProgress === null
          ? undefined
          : ({ "--pwa-fill": String(pwaProgress) } as CSSProperties)
      }
    >
      {name}
    </button>
  );
}
