import { createContext, useContext } from "react";

// Carries just the achievement state the header trophy button needs — the
// count of unlocks the user hasn't acknowledged yet. Kept off the checklist
// context (which is deliberately stable so the memoised list never re-renders
// on a settings change) so the badge can update on an unlock without
// reconciling the item list: a context consumer re-renders on its own even
// when its memoised parent (`ChecklistView`) doesn't.

export type AchievementsContextValue = {
  /** Achievements unlocked since the list was last opened (badge count). */
  unseenCount: number;
  /**
   * Whether the achievements system is switched on (the inverse of the
   * `disableAchievements` setting). When false the header trophy button hides
   * itself — the feature's only entry point — so the whole system disappears.
   */
  enabled: boolean;
};

export const AchievementsContext = createContext<AchievementsContextValue>({
  unseenCount: 0,
  enabled: true,
});

export function useAchievements(): AchievementsContextValue {
  return useContext(AchievementsContext);
}
