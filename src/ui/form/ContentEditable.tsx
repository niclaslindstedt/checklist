import { forwardRef, useEffect, useRef, type KeyboardEvent } from "react";

// A plain-text, single- or multi-line editable field built on a
// `contenteditable` div instead of `<input>` / `<textarea>`.
//
// Why not a real form control? On iOS, focusing a native input or textarea
// summons the system *form-assistant bar* — its own up/down/done bar above the
// keyboard — which web pages can neither reprogram nor hide. The checklist has
// its own keyboard nav bar (`EditNavBar`) that walks *between items*, so the
// native bar only duplicated it. iOS does **not** show that bar for
// contenteditable elements, so swapping the row editor's fields to this keeps
// the app's bar the only one on screen.
//
// `contentEditable="plaintext-only"` makes it behave like a text box — no rich
// formatting, paste lands as plain text, newlines are plain `\n` — so reading
// `textContent` round-trips the value. It's seeded once on mount and is then
// the source of its own text (`onInput` → `onChange`); we never write the prop
// back, which would clobber the caret mid-edit.

type Props = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** A multi-line note vs. a single-line title (only affects ARIA). */
  multiline?: boolean;
};

export const ContentEditable = forwardRef<HTMLDivElement, Props>(
  function ContentEditable(
    {
      value,
      onChange,
      onKeyDown,
      placeholder,
      ariaLabel,
      className,
      multiline,
    },
    ref,
  ) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const setRefs = (el: HTMLDivElement | null) => {
      innerRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    };

    // Seed the DOM text once on mount. The field owns its text after that.
    useEffect(() => {
      const el = innerRef.current;
      if (el && el.textContent !== value) el.textContent = value;
      // Intentionally mount-only: re-syncing on every `value` change would
      // reset the caret to the start while typing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <div
        ref={setRefs}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        aria-multiline={multiline ? true : undefined}
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={(e) => onChange(e.currentTarget.textContent ?? "")}
        onKeyDown={onKeyDown}
        className={className}
      />
    );
  },
);
