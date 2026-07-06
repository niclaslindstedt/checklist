// Typeahead for the add-item composer: as a draft is typed, the titles of
// the list's archived items are matched against it so a recurring entry
// ("Carrots" on the groceries list) is re-added with one press instead of
// retyped — the archive doubles as the list's memory, so it gets more
// useful the longer the list is lived in. Pure functions over the data
// model — no DOM, no I/O — reusing the search engine's plain-text matcher
// (substring first, fuzzy subsequence as the fallback) so the composer
// ranks and highlights matches exactly like the search modal.

import { activeItems, archivedItems } from "./archive-ops.ts";
import { flattenItems } from "./item-tree.ts";
import { matchPlainText, type MatchRange } from "./search.ts";
import type { Checklist } from "./types.ts";

/** One typeahead hit: an archived title plus the ranges to highlight. */
export interface TitleSuggestion {
  title: string;
  ranges: MatchRange[];
}

/** How many suggestions the composer shows at most. */
export const MAX_SUGGESTIONS = 5;

/**
 * The titles the composer's typeahead draws from: every item in the
 * checklist's archived subtrees, in document order, deduplicated
 * case-insensitively (first occurrence keeps its spelling) and excluding
 * titles already on the active list — suggesting a row that's visible
 * right there is noise, not help.
 */
export function archivedTitlePool(checklist: Checklist): string[] {
  const active = new Set(
    flattenItems(activeItems(checklist)).map((it) =>
      it.title.trim().toLowerCase(),
    ),
  );
  const seen = new Set<string>();
  const pool: string[] = [];
  for (const item of flattenItems(archivedItems(checklist))) {
    const title = item.title.trim();
    const key = title.toLowerCase();
    if (!title || active.has(key) || seen.has(key)) continue;
    seen.add(key);
    pool.push(title);
  }
  return pool;
}

/**
 * Rank `pool` against the draft text: best match score first (the search
 * engine puts substring and word-start hits above fuzzy ones), ties
 * alphabetical, capped at `limit`. An empty or blank draft suggests
 * nothing — the dropdown only appears once there's something to match.
 */
export function suggestTitles(
  pool: readonly string[],
  query: string,
  limit: number = MAX_SUGGESTIONS,
): TitleSuggestion[] {
  const needle = query.trim();
  if (!needle) return [];
  const hits: { suggestion: TitleSuggestion; score: number }[] = [];
  for (const title of pool) {
    const m = matchPlainText(title, needle);
    if (m)
      hits.push({ suggestion: { title, ranges: m.ranges }, score: m.score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score || a.suggestion.title.localeCompare(b.suggestion.title),
  );
  return hits.slice(0, limit).map((h) => h.suggestion);
}
