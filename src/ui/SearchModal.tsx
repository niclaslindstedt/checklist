import { useEffect, useId, useMemo, useRef, useState } from "react";

import { unlock } from "../achievements/bus.ts";
import {
  buildSearchIndex,
  search,
  segmentMatches,
  type ChecklistResult,
  type ItemMatch,
  type MatchRange,
} from "../domain/search.ts";
import { useT } from "../i18n";
import { useChecklistContext } from "./checklist-context.ts";
import { useFocusItem } from "./focus-item.ts";
import { Modal } from "./Modal.tsx";
import { useNav } from "./nav-context.ts";
import {
  CaretRightIcon,
  ChecklistIcon,
  CloseIcon,
  NoteIcon,
  SearchIcon,
} from "./icons.tsx";

// The search surface: a full-screen sheet on mobile, a centred card from `sm`
// up (the default `Modal` shell). It builds a flat search index over the live
// snapshot and runs the query (substring → fuzzy, wildcards, or a /regex/) as
// the user types, grouping the hits per checklist and highlighting the matched
// characters in place. Picking a result selects that list, asks the checklist
// view to scroll to and flash the item (see `focus-item.ts`), and closes.
//
// Reads its data straight from the contexts (like `ChecklistView`) rather than
// taking props, so the host (`SearchModalHost`) only owns open/close.

// How many item rows to render per list before collapsing the rest into a
// "+N more" note — keeps a pathological query from building a huge DOM.
const MAX_ITEMS_PER_LIST = 8;
// Note bodies can be long; show a window around the first match.
const NOTE_CLIP = 140;

/** Render text with its matched ranges wrapped in <mark>. */
function Highlighted({ text, ranges }: { text: string; ranges: MatchRange[] }) {
  return (
    <>
      {segmentMatches(text, ranges).map((seg, i) =>
        seg.match ? (
          <mark
            key={i}
            className="rounded-[2px] bg-accent/30 text-fg-bright [font-weight:inherit]"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

/** Clip a long note around its first match, shifting the ranges to suit. */
function clipNote(
  text: string,
  ranges: MatchRange[],
): { text: string; ranges: MatchRange[] } {
  if (text.length <= NOTE_CLIP || ranges.length === 0) {
    return { text, ranges };
  }
  const first = ranges[0]![0];
  // Centre the window on the first match, clamped to the text bounds.
  let start = Math.max(0, first - Math.floor(NOTE_CLIP / 3));
  let end = Math.min(text.length, start + NOTE_CLIP);
  start = Math.max(0, end - NOTE_CLIP);
  const lead = start > 0 ? "…" : "";
  const trail = end < text.length ? "…" : "";
  const shifted = ranges
    .filter(([s, e]) => e > start && s < end)
    .map(
      ([s, e]) =>
        [
          Math.max(0, s - start) + lead.length,
          Math.max(0, Math.min(end, e) - start) + lead.length,
        ] as MatchRange,
    );
  return { text: lead + text.slice(start, end) + trail, ranges: shifted };
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SearchModal({ open, onClose }: Props) {
  const t = useT();
  const { snapshot, selectChecklist } = useChecklistContext();
  const { navigate } = useNav();
  const { requestFocus } = useFocusItem();
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  // The index is derived from the live document, so it stays current as the
  // user edits between searches; cheap to rebuild for the sizes this app holds.
  const index = useMemo(() => buildSearchIndex(snapshot), [snapshot]);
  const { results, invalidRegex } = useMemo(
    () => search(index, query),
    [index, query],
  );
  const trimmed = query.trim();

  // Reset and focus the field each time the modal opens, so it's ready to type
  // into and never reopens onto a stale query.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  // Searching is the gesture the "Seeker" trophy watches for. The unlock bus
  // dedupes, so firing on every keystroke records it only once.
  useEffect(() => {
    if (trimmed) unlock("seeker");
  }, [trimmed]);

  function go(checklistId: string, itemId?: string) {
    selectChecklist(checklistId);
    if (itemId) requestFocus(itemId);
    navigate("checklist");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy={headingId}>
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-3 px-3 py-2">
        <span className="pl-1 text-muted">
          <SearchIcon className="h-5 w-5" />
        </span>
        <h2 id={headingId} className="sr-only">
          {t("search.title")}
        </h2>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          aria-label={t("search.title")}
          className="min-w-0 flex-1 border-0 bg-transparent py-1 text-base text-fg-bright outline-none placeholder:text-muted/70 [appearance:none] [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label={t("search.clear")}
            title={t("search.clear")}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg-bright"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-7 shrink-0 cursor-pointer items-center rounded px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg-bright"
        >
          {t("common.close")}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain]">
        {!trimmed ? (
          <div className="px-6 py-10 text-center text-sm text-muted">
            <SearchIcon className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p>{t("search.prompt")}</p>
            <p className="mx-auto mt-2 max-w-sm text-xs text-muted/80">
              {t("search.hint")}
            </p>
          </div>
        ) : invalidRegex ? (
          <Empty message={t("search.invalidRegex")} />
        ) : results.length === 0 ? (
          <Empty message={t("search.noResults", { query: trimmed })} />
        ) : (
          <>
            <p className="px-4 pt-3 pb-1 text-xs tracking-wide text-muted uppercase">
              {results.length === 1
                ? t("search.matchesOne")
                : t("search.matchesOther", { n: String(results.length) })}
            </p>
            <ul className="m-0 list-none p-0 pb-[env(safe-area-inset-bottom)]">
              {results.map((r) => (
                <ResultGroup
                  key={r.checklistId}
                  result={r}
                  onSelectList={() => go(r.checklistId)}
                  onSelectItem={(item) => go(r.checklistId, item.itemId)}
                  noteLabel={t("search.noteLabel")}
                  inListLabel={t("search.inList")}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="px-6 py-10 text-center text-sm text-muted">{message}</p>;
}

// One checklist's group: a header row that opens the list, then the matched
// items beneath it (title or clipped note body), each opening the list focused
// on that item.
function ResultGroup({
  result,
  onSelectList,
  onSelectItem,
  noteLabel,
  inListLabel,
}: {
  result: ChecklistResult;
  onSelectList: () => void;
  onSelectItem: (item: ItemMatch) => void;
  noteLabel: string;
  inListLabel: string;
}) {
  const shown = result.items.slice(0, MAX_ITEMS_PER_LIST);
  const overflow = result.items.length - shown.length;
  return (
    <li className="border-b border-line">
      <button
        type="button"
        onClick={onSelectList}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2"
      >
        <span className="text-accent">
          <ChecklistIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-bright">
          {result.nameRanges ? (
            <Highlighted text={result.name} ranges={result.nameRanges} />
          ) : (
            result.name
          )}
        </span>
        <CaretRightIcon className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {shown.map((item) => (
        <ItemRow
          key={`${item.itemId}-${item.field}`}
          item={item}
          onSelect={() => onSelectItem(item)}
          noteLabel={noteLabel}
        />
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={onSelectList}
          className="flex w-full cursor-pointer items-center gap-2 py-1.5 pr-4 pl-12 text-left text-xs text-muted hover:bg-surface-2 hover:text-fg-bright"
        >
          {`+${overflow} ${inListLabel}`}
        </button>
      )}
    </li>
  );
}

function ItemRow({
  item,
  onSelect,
  noteLabel,
}: {
  item: ItemMatch;
  onSelect: () => void;
  noteLabel: string;
}) {
  const isNote = item.field === "notes";
  const clipped = isNote ? clipNote(item.text, item.ranges) : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ paddingLeft: 28 + item.depth * 16 }}
      className="flex w-full cursor-pointer items-start gap-2 py-1.5 pr-4 text-left hover:bg-surface-2"
    >
      <span className="mt-0.5 shrink-0 text-muted">
        {isNote ? (
          <NoteIcon className="h-4 w-4" />
        ) : (
          <CaretRightIcon className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        {isNote ? (
          <span className="block min-w-0">
            <span className="text-sm text-fg">{item.title}</span>
            <span className="mt-0.5 line-clamp-2 text-xs text-muted">
              <span className="mr-1 text-meta">{noteLabel}:</span>
              <Highlighted text={clipped!.text} ranges={clipped!.ranges} />
            </span>
          </span>
        ) : (
          <span className="line-clamp-2 text-sm text-fg">
            <Highlighted text={item.text} ranges={item.ranges} />
          </span>
        )}
      </span>
    </button>
  );
}
