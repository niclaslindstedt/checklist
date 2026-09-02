import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";

import { useT } from "../i18n";
import { usePwaUpdate } from "../pwa/usePwaUpdate.ts";

// The header's checklist name — the wordmark slot beside the favicon. It
// shows the active checklist's name and doubles as the rename affordance:
// pressing it swaps in an inline text field (Enter / blur commits, Escape
// cancels). While a new build's service worker downloads, the name fills
// with the accent colour from the bottom as a vertical progress bar
// (`pwaProgress`, see usePwaUpdate) — the same treatment the wordmark
// carried before it became per-list.
//
// Opening the field is the delicate part on a phone. iOS raises the soft
// keyboard only for a `focus()` that runs while the tap is still being
// handled, and Preact defers passive effects past the paint — so the press
// swaps the field in with `flushSync` and focuses it from a *layout* effect
// inside that same flush, all within the gesture. (The Search button in
// `SideMenu` flushes its dispatch for the same reason.) `autoEdit` extends
// that to a list that has just been created: the view keys this component by
// the open list, so the fresh list mounts a new instance already editing and
// the same layout effect focuses it inside the creating tap.
//
// Closing it is the other half. On iOS a press on something non-focusable
// never blurs the field — with an empty list there is no row to take focus,
// so the name stayed focused and the keyboard up however many times the user
// pressed the list. A `pointerdown` anywhere outside the field therefore
// commits and closes it explicitly; Enter, Escape, and a blur into another
// field are unchanged.

export function ChecklistTitle({
  name,
  onRename,
  autoEdit = false,
}: {
  name: string;
  onRename: (name: string) => void;
  /**
   * Mount straight into the rename field with the name selected — the "name
   * it now" path a just-created list takes (see `rename-checklist.ts`). Read
   * once, at mount: the checklist view keys this component by the open list.
   */
  autoEdit?: boolean;
}) {
  const t = useT();
  const { progress: pwaProgress } = usePwaUpdate();
  const [editing, setEditing] = useState(autoEdit);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the field and select the whole name on entry, so a quick retype
  // replaces it outright. A layout effect, never a passive one — see above.
  useLayoutEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    input?.focus();
    input?.select();
  }, [editing]);

  function commit() {
    const next = inputRef.current?.value.trim() ?? "";
    if (next && next !== name) onRename(next);
    setEditing(false);
  }

  // Held in a ref because `commit` is re-made every render — the backstop
  // below must subscribe on opening the field, nothing else.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // The outside-press backstop: a press anywhere but the field commits and
  // closes it, which is what drops focus (and the keyboard) on iOS, where
  // pressing a non-focusable element doesn't blur a field on its own.
  useLayoutEffect(() => {
    if (!editing) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target === inputRef.current) return;
      commitRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        defaultValue={name}
        aria-label={t("app.renameChecklist")}
        // A list name is a sentence of its own, and the hint must be set
        // explicitly: in an installed iOS PWA the keyboard doesn't reset its
        // shift state for a field focused programmatically. `done` labels the
        // return key for what Enter does here — commit and close.
        autoCapitalize="sentences"
        enterKeyHint="done"
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
      // Swap the field in synchronously so the focus above rides this tap.
      onClick={() => flushSync(() => setEditing(true))}
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
