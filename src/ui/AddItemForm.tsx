import {
  useEffect,
  useRef,
  useState,
  type CompositionEvent,
  type KeyboardEvent,
} from "react";

import { capitalizeFirst } from "../domain/text.ts";
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
  onBackspaceEmpty,
  notesDisabled = false,
  capitalize = false,
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
  /**
   * Backspace was pressed in the still-empty composer, so the user means to
   * dismiss the draft row and back up into the line above it — mirroring the
   * in-row editor, where backspacing an empty title erases the line and moves
   * editing up. Return true if the caller handled it (closed the composer and
   * opened the line above for editing); the composer then swallows the
   * keystroke and stands down so the trailing blur doesn't fire again. Return
   * false (e.g. the composer sits at the very top, nothing above) to let the
   * keypress fall through untouched.
   */
  onBackspaceEmpty?: () => boolean;
  /** When set, item notes are off — Shift+Enter falls back to a plain add. */
  notesDisabled?: boolean;
  /**
   * When set, the first letter of the typed item is capitalised — live in the
   * field as you type and again when it commits, so "buy milk" is added as
   * "Buy milk". Mirrors the "Capitalise items" Lists setting.
   */
  capitalize?: boolean;
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
  // Set when Enter is pressed while the soft keyboard is still composing an
  // autocorrect suggestion: the add is deferred to `compositionend` (below)
  // so the corrected text — not the raw keystrokes — is what lands.
  const pendingSubmit = useRef<{ withBody: boolean } | null>(null);
  const t = useT();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Apply the "Capitalise items" preference to a title before it's committed.
  // A no-op when the setting is off or the string is empty.
  const titleCase = (text: string) =>
    capitalize ? capitalizeFirst(text) : text;

  // Add the item described by `raw`. Shift+Enter (`withBody`) commits and
  // hands off to editing the body, closing the composer; a plain add clears
  // the field and keeps focus so the next item can be typed straight away.
  const commit = (raw: string, withBody: boolean) => {
    const trimmed = titleCase(raw.trim());
    if (!trimmed) return;
    if (withBody) {
      committed.current = true;
      onAddWithBody(trimmed);
    } else {
      onAdd(trimmed);
      setValue("");
      inputRef.current?.focus();
    }
  };

  const addAndContinue = () => {
    // A composition-deferred Enter will be flushed by `onCompositionEnd` with
    // the corrected text; don't also add the stale value here.
    if (pendingSubmit.current) return;
    commit(value, false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Backspace in the empty composer erases the draft row and backs editing
    // up into the line above. If the caller takes it, swallow the keystroke
    // and mark the composer committed so the unmount-blur doesn't also close.
    if (e.key === "Backspace" && value === "") {
      if (onBackspaceEmpty?.()) {
        e.preventDefault();
        committed.current = true;
      }
      return;
    }
    if (e.key !== "Enter") return;
    const withBody = e.shiftKey && !notesDisabled;
    // On a soft keyboard, pressing Enter mid-autocorrect should accept the
    // suggestion first — exactly as Space does. The keystroke arrives while
    // the IME is still composing, so the field's value is the raw, un-
    // corrected text; defer the add to `compositionend`, which fires once the
    // suggestion is applied. Letting the composition commit means *not*
    // preventing the keystroke here.
    if (e.nativeEvent.isComposing) {
      pendingSubmit.current = { withBody };
      return;
    }
    // Own the Enter key outright so the native form submit never double-fires
    // alongside this handler — `onSubmit` stays only as a non-keyboard path.
    e.preventDefault();
    commit(value, withBody);
  };

  const onCompositionEnd = (e: CompositionEvent<HTMLInputElement>) => {
    const pending = pendingSubmit.current;
    if (!pending) return;
    pendingSubmit.current = null;
    // Read the committed text straight off the field — the autocorrect has
    // just been applied, so this holds the corrected value even though the
    // React state hasn't caught up to the trailing `input` event yet.
    commit(e.currentTarget.value, pending.withBody);
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
        // Capitalise live as the user types so the field shows the same text
        // that will commit; the trailing word is left untouched.
        onValueChange={(v) => setValue(titleCase(v))}
        onKeyDown={onKeyDown}
        onCompositionEnd={onCompositionEnd}
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
          const trimmed = titleCase(value.trim());
          if (trimmed) onAdd(trimmed);
          onClose();
        }}
        placeholder={t("app.addItemPlaceholder")}
        aria-label={t("app.addItem")}
        // Capitalise the first letter of each new item. The hint is set
        // explicitly because an installed iOS PWA (WKWebView) doesn't reset
        // the soft keyboard's shift state when this draft row is focused
        // straight after committing the previous item with Enter — so it
        // would otherwise stay lowercase from the row above.
        autoCapitalize="sentences"
        wrapperClassName="flex-1"
        // Match the checklist item title's colour exactly — only the bright
        // input default set it apart.
        textClassName="text-fg"
      />
    </form>
  );
}
