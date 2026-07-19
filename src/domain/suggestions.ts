// Typeahead for the add-item composer: as a draft is typed, the titles of
// the list's archived items are matched against it so a recurring entry
// ("Carrots" on the groceries list) is re-added with one press instead of
// retyped — the archive doubles as the list's memory, so it gets more
// useful the longer the list is lived in. Pure functions over the data
// model — no DOM, no I/O — reusing the search engine's plain-text matcher
// (substring first, fuzzy subsequence as the fallback) so the composer
// ranks and highlights matches exactly like the search modal.
//
// The archive also doubles as a frequency tally. Adding an item never
// *reuses* (un-archives) the matching archived copy — `addItem` always
// mints a fresh row — so each add-then-archive cycle leaves a distinct
// archived entry behind. Counting those copies is therefore a running
// count of how often an item has been used, and the typeahead surfaces the
// most-used titles first.

import { activeItems, archivedItems } from "./archive-ops.ts";
import { flattenItems } from "./item-tree.ts";
import { matchPlainText, type MatchRange } from "./search.ts";
import type { Checklist } from "./types.ts";

/**
 * One candidate title for the typeahead plus how many archived copies back
 * it — the frequency the composer ranks by.
 */
export interface TitleCount {
  title: string;
  count: number;
}

/**
 * One typeahead hit: an archived title, the ranges to highlight, and how
 * many archived copies it has (its usage count).
 */
export interface TitleSuggestion {
  title: string;
  ranges: MatchRange[];
  count: number;
}

/** How many suggestions the composer shows at most. */
export const MAX_SUGGESTIONS = 5;

/**
 * The titles the composer's typeahead draws from: every distinct title in
 * the checklist's archived subtrees, tallied by how many archived copies it
 * has. Deduplicated case-insensitively (first occurrence keeps its
 * spelling), in document order of first occurrence, and excluding titles
 * already on the active list — suggesting a row that's visible right there
 * is noise, not help.
 *
 * The `count` is the item's usage frequency: because a re-add never reuses
 * the archived copy, every time the user completes and archives an item
 * another copy of its title lands here, so a recurring entry accrues a
 * higher count than a one-off.
 */
export function archivedTitlePool(checklist: Checklist): TitleCount[] {
  const active = new Set(
    flattenItems(activeItems(checklist)).map((it) =>
      it.title.trim().toLowerCase(),
    ),
  );
  // Keyed by lower-cased title so copies that differ only in case tally
  // together; the map preserves first-occurrence (document) order.
  const counts = new Map<string, TitleCount>();
  for (const item of flattenItems(archivedItems(checklist))) {
    const title = item.title.trim();
    const key = title.toLowerCase();
    if (!title || active.has(key)) continue;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { title, count: 1 });
  }
  return [...counts.values()];
}

/**
 * Rank `pool` against the draft text. A title that *starts with* the draft
 * comes first — a prefix match beats frequency, so typing "B" surfaces
 * "Bananer" above a far more-used "Jordgubbar" that only contains a "b"
 * mid-word. Within each of those two groups the most-used titles lead (order
 * by archived-copy count, descending), so a recurring entry rises to the top;
 * remaining ties break on the search engine's match score (earlier and
 * word-start hits above fuzzy ones), then alphabetically. Capped at `limit`.
 * An empty or blank draft suggests nothing — the dropdown only appears once
 * there's something to match.
 */
export function suggestTitles(
  pool: readonly TitleCount[],
  query: string,
  limit: number = MAX_SUGGESTIONS,
): TitleSuggestion[] {
  const needle = query.trim();
  if (!needle) return [];
  const lowNeedle = needle.toLowerCase();
  const hits: {
    suggestion: TitleSuggestion;
    score: number;
    prefix: boolean;
  }[] = [];
  for (const { title, count } of pool) {
    const m = matchPlainText(title, needle);
    if (m)
      hits.push({
        suggestion: { title, ranges: m.ranges, count },
        score: m.score,
        prefix: title.trim().toLowerCase().startsWith(lowNeedle),
      });
  }
  hits.sort(
    (a, b) =>
      Number(b.prefix) - Number(a.prefix) ||
      b.suggestion.count - a.suggestion.count ||
      b.score - a.score ||
      a.suggestion.title.localeCompare(b.suggestion.title),
  );
  return hits.slice(0, limit).map((h) => h.suggestion);
}
