import { TrophyGlyph } from "../../achievements/glyphs.tsx";
import { useT } from "../../i18n";
import { useModalDispatch } from "../modal-bus.ts";
import { useAchievements } from "./achievements-context.ts";

// Side-menu row for achievements, living among the footer actions (settings,
// "what's new", project links) at the foot of the drawer. It's the
// checklist's analogue of budget's `HeaderStar`, with the same two modes —
// only relocated from the header into the sidebar so the header chrome stays
// lean:
//
// - **Quiet (grey glyph, no badge)** — nothing new to acknowledge. Click
//   opens the full four-tier achievements tour (`{ kind: "achievements" }`).
// - **Lit (coloured glyph, count badge)** — one or more achievements
//   unlocked since they were last acknowledged. Click opens the unlock
//   notification modal listing just those new ones
//   (`{ kind: "achievements-unlock" }`); closing it clears the unseen queue,
//   returning the row to its quiet state.
//
// Styled to match the side-menu `MenuButton` / `NavItem` rows (px-5, the
// density vertical padding, gap-3, h-5 glyph) so it reads as one continuous
// list with the footer items around it. Reads the unseen count from
// `AchievementsContext` rather than props, so a fresh unlock badges the row
// without re-rendering the memoised item list.
export function TrophyButton({ onSelect }: { onSelect?: () => void }) {
  const t = useT();
  const dispatch = useModalDispatch();
  const { unseenCount, enabled } = useAchievements();
  // Achievements switched off (Settings → General): the row is the only way
  // into the tour / unlock modals, so hiding it removes the feature wholesale.
  if (!enabled) return null;
  const lit = unseenCount > 0;
  // The accessible label carries the dynamic state ("3 new achievements");
  // the visible row label stays the stable "Achievements".
  const label = lit
    ? unseenCount === 1
      ? t("achievements.button.unseenOne")
      : t("achievements.button.unseenOther", { n: String(unseenCount) })
    : t("achievements.button.open");
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.();
        dispatch({ kind: lit ? "achievements-unlock" : "achievements" });
      }}
      title={label}
      aria-label={label}
      className="flex w-full cursor-pointer items-center gap-3 px-5 py-[var(--density-row-py)] text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className={lit ? "text-flag" : "text-muted/50"}>
        <TrophyGlyph className="h-5 w-5" />
      </span>
      <span className="flex-1">{t("achievements.button.open")}</span>
      {lit && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-flag px-1.5 py-0.5 text-xs leading-none font-bold text-page-bg tabular-nums">
          {unseenCount}
        </span>
      )}
    </button>
  );
}
