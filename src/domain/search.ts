// Full-text search over the persisted document. Pure functions over the
// data model — no DOM, no I/O — so the whole engine is unit-testable and
// obeys the `src/domain/` purity rule (see AGENTS.md).
//
// Two halves:
//   • `buildSearchIndex` flattens a `Snapshot` into a flat list of
//     searchable entries — one for each checklist name, each item title,
//     and each item note body, walking sub-items recursively so a deeply
//     nested child is as findable as a top-level one. Archived lists and
//     archived items are skipped: a result navigates the user to the live
//     checklist view, and there'd be nowhere to land them otherwise.
//   • `search` parses the query and tests every entry, returning the
//     matches grouped per checklist with the character ranges that matched
//     so the UI can highlight them in place.
//
// The query language is progressive:
//   • `/pattern/flags` → a JavaScript regular expression (an invalid one is
//     reported back so the UI can say so rather than silently finding
//     nothing).
//   • a bare term containing `*` or `?` → shell-style wildcards (`*` = any
//     run, `?` = any single character), matched anywhere in the text.
//   • anything else → a plain case-insensitive substring match, and when
//     that finds nothing, a fuzzy subsequence match (the query's letters in
//     order but not necessarily adjacent), so a quick "abbreviation" still
//     surfaces the row.

import type { ChecklistItem, Snapshot } from "./types.ts";

/** Which part of a checklist an entry came from. */
export type SearchField = "checklist" | "item" | "notes";

/** One searchable piece of text, tagged with where it lives. */
export interface SearchEntry {
  checklistId: string;
  checklistName: string;
  field: SearchField;
  /** The item the text belongs to (absent for a `checklist`-name entry). */
  itemId?: string;
  /** The owning item's title, for context in the result row. */
  itemTitle?: string;
  /** Nesting depth of the owning item (0 for the list name / top-level items). */
  depth: number;
  /** The text actually searched and highlighted. */
  text: string;
}

/** The flattened, searchable projection of a snapshot. */
export interface SearchIndex {
  entries: SearchEntry[];
}

/** A half-open `[start, end)` range of matched characters within a text. */
export type MatchRange = [number, number];

/** A matched item (title or note body) within a checklist result. */
export interface ItemMatch {
  itemId: string;
  title: string;
  field: "item" | "notes";
  text: string;
  ranges: MatchRange[];
  depth: number;
}

/** All matches found within one checklist, ready to render as a group. */
export interface ChecklistResult {
  checklistId: string;
  name: string;
  /** Ranges within the list name when the name itself matched, else null. */
  nameRanges: MatchRange[] | null;
  items: ItemMatch[];
  /** Best single-match score in the group — drives result ordering. */
  score: number;
}

/** The outcome of a search: grouped results, plus whether the regex was bad. */
export interface SearchOutcome {
  results: ChecklistResult[];
  /** True when the query was a `/…/` regex that failed to compile. */
  invalidRegex: boolean;
}

// ── Index ──────────────────────────────────────────────────────────────

/**
 * Flatten a snapshot into searchable entries. One entry per checklist name,
 * one per (active) item title, and one per non-empty item note body, walking
 * children recursively. Archived lists and items are omitted.
 */
export function buildSearchIndex(snapshot: Snapshot): SearchIndex {
  const entries: SearchEntry[] = [];
  for (const list of snapshot.checklists) {
    if (list.archived) continue;
    entries.push({
      checklistId: list.id,
      checklistName: list.name,
      field: "checklist",
      depth: 0,
      text: list.name,
    });
    const walk = (items: readonly ChecklistItem[], depth: number) => {
      for (const item of items) {
        if (item.archived) continue;
        entries.push({
          checklistId: list.id,
          checklistName: list.name,
          field: "item",
          itemId: item.id,
          itemTitle: item.title,
          depth,
          text: item.title,
        });
        const notes = item.notes?.trim();
        if (notes) {
          entries.push({
            checklistId: list.id,
            checklistName: list.name,
            field: "notes",
            itemId: item.id,
            itemTitle: item.title,
            depth,
            text: item.notes!,
          });
        }
        if (item.children) walk(item.children, depth + 1);
      }
    };
    walk(list.items, 0);
  }
  return { entries };
}

// ── Query parsing ──────────────────────────────────────────────────────

type Matcher =
  | { kind: "regex"; re: RegExp }
  | { kind: "wildcard"; re: RegExp }
  | { kind: "text"; needle: string };

type ParsedQuery =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "matcher"; matcher: Matcher };

const REGEX_LITERAL = /^\/(.+)\/([a-z]*)$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escape a wildcard term, mapping `*`→`.*` and `?`→`.` but escaping the rest. */
function wildcardToRegExp(term: string): RegExp {
  const body = term
    .split("")
    .map((ch) => (ch === "*" ? ".*" : ch === "?" ? "." : escapeRegExp(ch)))
    .join("");
  return new RegExp(body, "giu");
}

export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };

  const asRegex = REGEX_LITERAL.exec(trimmed);
  if (asRegex) {
    const [, body, flags] = asRegex;
    // Always iterate globally and case-insensitively unless the user opted
    // into case sensitivity by... they can't here, so default to `gi`. Keep
    // any flags the user added (e.g. `s`, `u`) but force `g` so `matchAll`
    // walks every hit.
    const wanted = new Set((flags ?? "").split(""));
    wanted.add("g");
    wanted.add("i");
    try {
      return {
        kind: "matcher",
        matcher: { kind: "regex", re: new RegExp(body!, [...wanted].join("")) },
      };
    } catch {
      return { kind: "invalid" };
    }
  }

  if (trimmed.includes("*") || trimmed.includes("?")) {
    return {
      kind: "matcher",
      matcher: { kind: "wildcard", re: wildcardToRegExp(trimmed) },
    };
  }

  return { kind: "matcher", matcher: { kind: "text", needle: trimmed } };
}

// ── Matching ───────────────────────────────────────────────────────────

interface Match {
  ranges: MatchRange[];
  score: number;
}

/** Merge overlapping/adjacent ranges so the UI never double-marks a span. */
function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: MatchRange[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]!;
    const cur = sorted[i]!;
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur);
  }
  return out;
}

function matchRegExp(text: string, re: RegExp): Match | null {
  const ranges: MatchRange[] = [];
  // Clone so concurrent uses of a shared RegExp don't fight over lastIndex.
  const g = new RegExp(
    re.source,
    re.flags.includes("g") ? re.flags : re.flags + "g",
  );
  for (const m of text.matchAll(g)) {
    if (m.index === undefined) continue;
    // A zero-width match (e.g. `a*`) can't be highlighted and would loop —
    // skip it but still count the entry as a (weak) hit.
    if (m[0].length === 0) continue;
    ranges.push([m.index, m.index + m[0].length]);
  }
  if (ranges.length === 0) return null;
  const merged = mergeRanges(ranges);
  // Earlier + more matches rank higher.
  const score = 600 - Math.min(merged[0]![0], 500) + merged.length;
  return { ranges: merged, score };
}

function matchSubstring(text: string, needle: string): Match | null {
  const haystack = text.toLowerCase();
  const lowNeedle = needle.toLowerCase();
  const ranges: MatchRange[] = [];
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(lowNeedle, from);
    if (idx === -1) break;
    ranges.push([idx, idx + lowNeedle.length]);
    from = idx + lowNeedle.length;
  }
  if (ranges.length === 0) return null;
  // A whole-text or word-start match scores best; otherwise earlier is better.
  const first = ranges[0]![0];
  const wholeWord = first === 0 || /\s/.test(text[first - 1] ?? "");
  const score =
    1000 - Math.min(first, 500) + (wholeWord ? 200 : 0) + ranges.length;
  return { ranges: mergeRanges(ranges), score };
}

/**
 * Fuzzy subsequence: every character of `needle` appears in `text` in order
 * (not necessarily adjacent). Highlights each matched character and scores by
 * how tightly packed the run is, so `grcl` ranks "grocery list" above a
 * scattered coincidence. Single-character queries don't fuzzy-match (too
 * noisy) — the substring pass already covers those.
 */
function matchFuzzy(text: string, needle: string): Match | null {
  if (needle.length < 2) return null;
  const haystack = text.toLowerCase();
  const lowNeedle = needle.toLowerCase();
  const ranges: MatchRange[] = [];
  let ti = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  for (let ni = 0; ni < lowNeedle.length; ni++) {
    const ch = lowNeedle[ni]!;
    if (ch === " ") continue; // spaces in the query are separators, not chars
    let found = -1;
    while (ti < haystack.length) {
      if (haystack[ti] === ch) {
        found = ti;
        ti++;
        break;
      }
      ti++;
    }
    if (found === -1) return null;
    if (firstIdx === -1) firstIdx = found;
    lastIdx = found;
    // Extend a contiguous range rather than emitting one per character.
    const last = ranges[ranges.length - 1];
    if (last && last[1] === found) last[1] = found + 1;
    else ranges.push([found, found + 1]);
  }
  if (ranges.length === 0) return null;
  const span = lastIdx - firstIdx + 1;
  const compactness = Math.max(0, 200 - (span - lowNeedle.length) * 8);
  const score = 100 + compactness - Math.min(firstIdx, 100);
  return { ranges: mergeRanges(ranges), score };
}

function matchEntry(text: string, matcher: Matcher): Match | null {
  switch (matcher.kind) {
    case "regex":
    case "wildcard":
      return matchRegExp(text, matcher.re);
    case "text":
      return (
        matchSubstring(text, matcher.needle) ?? matchFuzzy(text, matcher.needle)
      );
  }
}

// ── Search ─────────────────────────────────────────────────────────────

/**
 * Run `raw` against the index, grouping the hits per checklist. A list-name
 * hit fills `nameRanges`; item-title and note-body hits fill `items`. Results
 * are ordered by their best match score (then name); items within a group keep
 * document order. An empty query yields no results; an invalid `/…/` regex sets
 * `invalidRegex` so the UI can explain the empty result.
 */
export function search(index: SearchIndex, raw: string): SearchOutcome {
  const parsed = parseQuery(raw);
  if (parsed.kind === "empty") return { results: [], invalidRegex: false };
  if (parsed.kind === "invalid") return { results: [], invalidRegex: true };
  const { matcher } = parsed;

  // checklistId → accumulating result, kept in first-seen (document) order.
  const groups = new Map<string, ChecklistResult>();
  const order: string[] = [];
  const groupFor = (e: SearchEntry): ChecklistResult => {
    let g = groups.get(e.checklistId);
    if (!g) {
      g = {
        checklistId: e.checklistId,
        name: e.checklistName,
        nameRanges: null,
        items: [],
        score: 0,
      };
      groups.set(e.checklistId, g);
      order.push(e.checklistId);
    }
    return g;
  };

  // De-dupe item-level hits: an item's title and its note are separate
  // entries, but we never want the same (item, field) twice.
  for (const entry of index.entries) {
    const m = matchEntry(entry.text, matcher);
    if (!m) continue;
    const g = groupFor(entry);
    g.score = Math.max(g.score, m.score);
    if (entry.field === "checklist") {
      g.nameRanges = m.ranges;
      // A name hit is worth a little extra so the list surfaces near the top.
      g.score = Math.max(g.score, m.score + 50);
    } else {
      g.items.push({
        itemId: entry.itemId!,
        title: entry.itemTitle ?? entry.text,
        field: entry.field,
        text: entry.text,
        ranges: m.ranges,
        depth: entry.depth,
      });
    }
  }

  const results = order.map((id) => groups.get(id)!);
  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { results, invalidRegex: false };
}

/**
 * Split `text` into alternating plain / highlighted segments from a set of
 * match ranges, so a renderer can wrap only the matched spans. Ranges are
 * assumed sorted and non-overlapping (as `search` returns them).
 */
export function segmentMatches(
  text: string,
  ranges: MatchRange[],
): { text: string; match: boolean }[] {
  if (ranges.length === 0) return [{ text, match: false }];
  const out: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor)
      out.push({ text: text.slice(cursor, start), match: false });
    out.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length)
    out.push({ text: text.slice(cursor), match: false });
  return out;
}
