import { useCallback, useRef, useState, type RefObject } from "react";

import { useT, type MessageKey } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel.tsx";
import type { FloatingPlacement } from "../hooks/useFloatingPosition.ts";
import { ChevronDownIcon } from "../icons.tsx";

// The cheat sheet beside the pattern field in the transform editor. Nobody
// remembers whether "one or more" is `+` or `*`, and a regular expression is
// the one part of a transform rule that can't be discovered by poking at it —
// so the building blocks are a dropdown: each row shows the token and what it
// does, and pressing one drops it into the pattern at the cursor.

type Token = {
  /** Stable key, and the `settings.transform.token.<key>` string it reads. */
  key: string;
  /** What the row shows, and what gets inserted. */
  insert: string;
  /**
   * Where the caret lands afterwards, counted back from the end of the
   * inserted text — so `(…)` and `[…]` leave the cursor between the brackets,
   * ready for the thing being grouped.
   */
  caretBack?: number;
};

// Ordered roughly by how often a rule needs them: character classes first,
// then repetition, then grouping and anchors.
const TOKENS: readonly Token[] = [
  { key: "digit", insert: "\\d" },
  { key: "word", insert: "\\w" },
  { key: "space", insert: "\\s" },
  { key: "any", insert: "." },
  { key: "plus", insert: "+" },
  { key: "star", insert: "*" },
  { key: "optional", insert: "?" },
  { key: "repeat", insert: "{2,4}" },
  { key: "set", insert: "[]", caretBack: 1 },
  { key: "notSet", insert: "[^]", caretBack: 1 },
  { key: "group", insert: "()", caretBack: 1 },
  { key: "nonCapture", insert: "(?:)", caretBack: 1 },
  { key: "alt", insert: "|" },
  { key: "start", insert: "^" },
  { key: "end", insert: "$" },
  { key: "boundary", insert: "\\b" },
  { key: "escape", insert: "\\." },
];

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 260 },
  anchor: "right",
  coordinateSpace: "document",
};

type Props = {
  /** The pattern field the tokens are inserted into. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** Current pattern, so an insert can be spliced at the caret. */
  value: string;
  onChange: (next: string) => void;
};

export function RegexHelper({ inputRef, value, onChange }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const insert = (token: Token) => {
    const input = inputRef.current;
    // Splice at the caret (replacing any selection) when the field is live,
    // and append when it isn't — the panel steals focus, so the selection
    // range is read back off the input rather than tracked separately.
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token.insert + value.slice(end);
    onChange(next);
    setOpen(false);
    const caret = start + token.insert.length - (token.caretBack ?? 0);
    // Restore focus after the panel unmounts, or the browser drops the
    // caret back to the end of the field.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("settings.transform.insertAria")}
        className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded border px-2 py-1.5 text-xs ${
          open
            ? "border-accent bg-accent/15 text-accent"
            : "border-line bg-surface-2 text-fg hover:bg-surface-3"
        }`}
      >
        {t("settings.transform.insert")}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={PLACEMENT}
      >
        <div
          role="menu"
          className="flex max-h-72 w-full flex-col gap-0.5 overflow-y-auto overscroll-contain p-2"
        >
          {TOKENS.map((token) => (
            <button
              key={token.key}
              type="button"
              role="menuitem"
              onClick={() => insert(token)}
              className="flex w-full cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-surface"
            >
              <code className="w-14 shrink-0 rounded bg-surface-3 px-1 py-0.5 text-center font-mono text-xs text-accent">
                {token.insert}
              </code>
              <span className="min-w-0 text-xs text-fg">
                {t(`settings.transform.token.${token.key}` as MessageKey)}
              </span>
            </button>
          ))}
        </div>
      </FloatingPanel>
    </>
  );
}
