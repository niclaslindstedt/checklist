import type { Widen } from "./_widen";

// Strings for the search modal — the input chrome, the empty / no-result /
// invalid-regex states, and the per-result context labels. Opened from the
// action bar's magnifier (right of undo/redo); see `src/ui/SearchModal.tsx`.

const search = {
  title: "Search",
  placeholder: "Search lists, items, notes…",
  clear: "Clear search",
  // The empty-input prompt and the one-line syntax hint beneath the field.
  prompt: "Search across every list — names, items, notes, and sub-items.",
  hint: "Plain text, fuzzy by default. Use wildcards (car*, sun?creen) or a /regex/.",
  // Result chrome.
  matchesOne: "1 list",
  matchesOther: "{n} lists",
  noteLabel: "Note",
  inList: "in this list",
  // Empty / error states.
  noResults: "No matches for “{query}”.",
  invalidRegex: "That regular expression isn’t valid.",
} as const;

export type SearchCatalog = Widen<typeof search>;

export default search;
