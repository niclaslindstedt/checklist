import { TrophyGlyph } from "../../achievements/glyphs.tsx";
import { useT } from "../../i18n";
import { useModalDispatch } from "../modal-bus.ts";
import { useAchievements } from "./achievements-context.ts";

// Header affordance that opens the achievements tour, sitting beside the
// copy / sync glyphs in the checklist header (the checklist's analogue of
// budget's `HeaderStar`). Two visual modes:
//
// - **Quiet (outline)** — nothing new to acknowledge.
// - **Lit (yellow)** — one or more achievements unlocked since the list was
//   last opened; a small count badge rides the corner. Opening the modal
//   clears the unseen queue, returning the button to its quiet state.
//
// Styled to match `CopyButton` / `SyncStatus` so the header chrome stays
// uniform (36 × 36, 18-pixel glyph). Reads the unseen count from
// `AchievementsContext` rather than props, so a fresh unlock badges the
// button without re-rendering the memoised item list.
export function TrophyButton() {
  const t = useT();
  const dispatch = useModalDispatch();
  const { unseenCount } = useAchievements();
  const lit = unseenCount > 0;
  const label = lit
    ? unseenCount === 1
      ? t("achievements.button.unseenOne")
      : t("achievements.button.unseenOther", { n: String(unseenCount) })
    : t("achievements.button.open");
  return (
    <button
      type="button"
      onClick={() => dispatch({ kind: "achievements" })}
      title={label}
      aria-label={label}
      className={`relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border bg-transparent focus-visible:ring-2 focus-visible:ring-fg focus-visible:outline-none ${
        lit
          ? "border-flag bg-flag/15 text-flag hover:bg-flag/25"
          : "border-line text-muted hover:bg-fg/5 hover:text-fg"
      }`}
    >
      <TrophyGlyph className="h-[18px] w-[18px]" />
      {lit && (
        <span className="absolute -top-1.5 -right-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-flag px-1 text-[10px] leading-4 font-bold text-page-bg tabular-nums">
          {unseenCount}
        </span>
      )}
    </button>
  );
}
