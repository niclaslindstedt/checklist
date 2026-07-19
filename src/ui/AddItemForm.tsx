import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CompositionEvent,
  type KeyboardEvent,
} from "react";

import { unlock } from "../achievements/bus.ts";
import { segmentMatches } from "../domain/search.ts";
import { suggestTitles, type TitleCount } from "../domain/suggestions.ts";
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
//
// Typing also consults the list's archive (`suggestionPool`): titles that
// match the draft — substring or fuzzy, the search engine's semantics —
// appear as a typeahead below the field with the matched letters
// highlighted, the most-used titles first. Pressing one adds that item
// verbatim (a fresh copy — the archived original is never reused, so its
// usage count keeps climbing) and clears the field
// for the next entry, so a recurring item ("Carrots" on the groceries
// list) is one press instead of retyped. Arrow keys walk the suggestions,
// Enter picks the highlighted one, Escape dismisses them until the draft
// changes again.

export function AddItemForm({
  onAdd,
  onAddWithBody,
  onImport,
  onClose,
  onBackspaceEmpty,
  notesDisabled = false,
  capitalize = false,
  depth = 0,
  suggestionPool,
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
  /**
   * Archived titles the typeahead draws from, each with its usage count (see
   * `archivedTitlePool`). Absent or empty, the composer never shows
   * suggestions.
   */
  suggestionPool?: readonly TitleCount[];
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

  // The typeahead: archived titles matching the draft, capped and ranked by
  // the domain. `selected` is the arrow-key highlight (-1 = none); `dismissed`
  // hides the dropdown after Escape until the draft changes again.
  const [selected, setSelected] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const suggestions = useMemo(
    () => (suggestionPool?.length ? suggestTitles(suggestionPool, value) : []),
    [suggestionPool, value],
  );
  const showSuggestions = suggestions.length > 0 && !dismissed;

  // Any edit to the draft re-arms the dropdown and drops the highlight —
  // the old selection would point at a different title once the matches move.
  const editValue = (v: string) => {
    setValue(v);
    setSelected(-1);
    setDismissed(false);
  };

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
      editValue("");
      inputRef.current?.focus();
    }
  };

  const addAndContinue = () => {
    // A composition-deferred Enter will be flushed by `onCompositionEnd` with
    // the corrected text; don't also add the stale value here.
    if (pendingSubmit.current) return;
    commit(value, false);
  };

  // Enter a picked suggestion verbatim — it's an archived title, so it
  // already carries its stored spelling and skips the capitalise pass —
  // then clear the field and keep focus for the next entry. This is the
  // chokepoint that observes the gesture, so it fires the achievement.
  const pickSuggestion = (title: string) => {
    onAdd(title);
    unlock("dejaVu");
    editValue("");
    inputRef.current?.focus();
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
    if (showSuggestions) {
      // The dropdown owns the vertical arrows and Escape while it's up;
      // everything else falls through to the plain composer keys below.
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => (s + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => (s <= 0 ? suggestions.length - 1 : s - 1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(true);
        setSelected(-1);
        return;
      }
      // Enter with a highlighted suggestion picks it instead of committing
      // the raw draft. Shift+Enter keeps its add-with-body meaning, and a
      // composing Enter defers as usual — both take the plain path below.
      if (
        e.key === "Enter" &&
        selected >= 0 &&
        !e.shiftKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
        pickSuggestion(suggestions[selected]!.title);
        return;
      }
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
      className="border-b border-line px-[var(--density-row-px)] py-[var(--density-row-py)]"
      onSubmit={(e) => {
        e.preventDefault();
        addAndContinue();
      }}
    >
      <div className="flex min-h-11 items-center gap-3">
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
          onValueChange={(v) => editValue(titleCase(v))}
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
      </div>
      {showSuggestions && (
        // The typeahead: archived titles matching the draft, indented to the
        // input's text column (past the two h-5 leading slots and their
        // gap-3s = 4rem). `mousedown` is swallowed on each row so picking
        // doesn't blur the field — the blur would commit the raw draft and
        // close the composer before the click lands.
        <ul
          role="listbox"
          aria-label={t("app.suggestions")}
          className="m-0 list-none p-0 pb-1 pl-16"
        >
          {suggestions.map((s, i) => (
            <li key={s.title} role="option" aria-selected={i === selected}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(s.title)}
                className={`block w-full rounded-sm px-2 py-2 text-left text-base ${
                  i === selected
                    ? "bg-surface-3 text-fg"
                    : "text-muted hover:bg-surface-3 hover:text-fg"
                }`}
              >
                {segmentMatches(s.title, s.ranges).map((seg, j) =>
                  seg.match ? (
                    <mark
                      key={j}
                      className="rounded-[2px] bg-accent/30 text-fg-bright [font-weight:inherit]"
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <span key={j}>{seg.text}</span>
                  ),
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
