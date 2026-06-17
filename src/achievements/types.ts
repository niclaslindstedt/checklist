// Achievement model, adapted from the budget project's
// `src/data/achievements/types.ts`. Budget derives every unlock from a
// single `UserData` reducer transition; the checklist has no reducer, so a
// predicate sees an `AchState` snapshot that bundles the two state islands
// an unlock can hinge on — the persisted document (`Snapshot`) and the
// synced appearance `Settings`. Everything else (cloud connect, encryption,
// namespace create, clipboard copy, install, language switch) fires through
// the manual bus, exactly as in budget.

import type { Snapshot } from "../domain/types.ts";
import type { Settings } from "../settings/types.ts";
import type { Glyph } from "./glyphs.tsx";

// Four tiers that mirror the four stages of using the app — from "just
// opened it" to "bending it to my workflow". Point values are uniform per
// tier so the catalog stays easy to balance as it grows.
export type AchievementTier = "beginner" | "intermediate" | "pro" | "expert";

export const TIER_POINTS: Record<AchievementTier, number> = {
  beginner: 10,
  intermediate: 25,
  pro: 50,
  expert: 100,
};

export const TIER_ORDER: readonly AchievementTier[] = [
  "beginner",
  "intermediate",
  "pro",
  "expert",
];

// The two state islands a derived predicate can read. Reducers in budget
// preserve referential identity on untouched slices; the checklist's hooks
// do the same (a cell edit replaces only `snapshot`, an appearance change
// only `settings`), so the `slices` pre-check below stays cheap.
export type AchState = {
  snapshot: Snapshot;
  settings: Settings;
};

// Two kinds of unlock trigger:
//
// - `derived` — the achievement watcher receives every (prev, next)
//   `AchState` transition and runs each `predicate`. When the predicate
//   flips from false to true on this transition, the unlock fires. The
//   predicate sees the full pre- and post-transition state, so it can spot
//   "this user just added their first item", "this user just turned a
//   theme on", etc.
//
// - `manual` — the trigger lives outside the document / settings state
//   (cloud connect, encryption toggle, language switch, clipboard copy).
//   Callers fire the unlock by calling `unlock(id)` from
//   `src/achievements`; the bus stores it until the watcher mounted in App
//   is ready to record it.
export type Trigger =
  | {
      kind: "derived";
      predicate: (prev: AchState, next: AchState) => boolean;
      // Optional slice extractor. When provided, `deriveUnlocks` invokes the
      // predicate only when at least one returned reference differs between
      // prev and next — so a settings-only change skips every snapshot
      // predicate without running it, and vice versa. Each slice listed must
      // be one the predicate actually reads, or a relevant change would be
      // silently filtered out.
      slices?: (state: AchState) => readonly unknown[];
    }
  | { kind: "manual" };

export type Achievement = {
  // Stable string id — once shipped, never renamed. Used as the key inside
  // `Settings.achievements` and the bus's pending queue, as the React key in
  // catalog renders, and as the path segment in the i18n catalog
  // (`achievements.catalog.<id>.{name,condition,learnMore}`).
  id: string;
  tier: AchievementTier;
  glyph: Glyph;
  // Whether the i18n catalog carries a `learnMore` key for this id. The
  // expanded body is shown inside a per-achievement `<details>`; not every
  // achievement needs depth beyond the condition, so each entry declares the
  // presence here and the renderer reads through it instead of probing the
  // catalog at runtime.
  hasLearnMore?: boolean;
  trigger: Trigger;
};
