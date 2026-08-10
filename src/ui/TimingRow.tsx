import {
  deadlineStatus,
  isHeldBack,
  type DeadlineStatus,
} from "../domain/checklists.ts";
import type { Recurrence } from "../domain/types.ts";
import { bcp47, useLang, useT } from "../i18n";
import { DeadlineIcon, NotBeforeIcon, RepeatIcon } from "./icons.tsx";

// The slim "date row" above a checklist item that carries any timing. It says
// as little as possible: a glyph and a date, no labels.
//
// The two glyphs are a matched pair and carry the meaning between them —
// `|—◷` for the earliest day the item may be started, `◷—|` for the day it
// falls due — so neither needs the words spelling it out. What's left is
// three signals doing the work:
//
//   • **The glyph** says which bound this is.
//   • **The colour** says how urgent a due date is: muted while it's far off,
//     warming through yellow (within a week) and orange (within a day) to red
//     once it's overdue (`deadlineStatus`). A "not before" date carries no
//     urgency at all — nothing is late, the item just isn't open yet — so it
//     stays muted at every distance.
//   • **The checkbox** says whether the item can be acted on: a held-back one
//     is drawn inert. That's the signal that never scrolls away, which is why
//     a run of items sharing one gate day can state the day once (see
//     `sameGate`) instead of stacking the same date down the screen.
//
// The gate half is temporary — shown only while the day is still ahead, gone
// the moment it arrives, the same test that releases the checkbox
// (`isHeldBack`). Formatting the dates and the recurrence summary is a
// presentation concern and lives here; the buckets and the hold test are pure
// domain.

// Urgency band → text colour. `later` stays muted; the rest warm up. The
// tokens map to the theme (see `styles/palettes.css`): `meta` is the yellow
// accent, `flag` the orange one, `danger` the red one.
const STATUS_CLASS: Record<DeadlineStatus, string> = {
  overdue: "text-danger",
  "due-soon": "text-flag",
  upcoming: "text-meta",
  later: "text-muted",
};

type Props = {
  notBefore?: string;
  deadline?: string;
  recurrence?: Recurrence;
  /**
   * The row above already states this same gate day — drop the gate half and
   * let this row read as a continuation of that run. The inert checkbox still
   * marks it as held back.
   */
  sameGate?: boolean;
};

// `ml-16` lines the row up under the item **title**, clearing the caret and
// checkbox columns (20px caret + 12px gap + 20px box + 12px gap): the dates
// belong to the words, not to the box. The enclosing foreground already
// carries the nesting indent, so a sub-item's date row shifts right with it.
export function TimingRow({
  notBefore,
  deadline,
  recurrence,
  sameGate = false,
}: Props) {
  const t = useT();
  const lang = useLang();
  const now = new Date().toISOString();
  const held = isHeldBack({ notBefore }, now) && !sameGate;
  const status = deadline ? deadlineStatus(deadline, now) : null;
  const summary = recurrence ? recurrenceSummary(recurrence, t) : null;

  if (!held && !deadline) return null;

  return (
    <div className="ml-16 flex items-center gap-2 pt-1 pb-0.5 text-[0.7rem] leading-none font-medium tracking-wide">
      {held && (
        <span
          className="flex items-center gap-1 truncate text-muted"
          title={t("app.timing.notBefore")}
        >
          <NotBeforeIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{formatDay(notBefore!, lang)}</span>
        </span>
      )}
      {deadline && status && (
        <span
          className={`flex items-center gap-1 truncate ${STATUS_CLASS[status]}`}
          title={t("app.timing.dueDate")}
        >
          <DeadlineIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {status === "overdue"
              ? `${t("app.timing.overdue")} · ${formatDay(deadline, lang)}`
              : formatDay(deadline, lang)}
          </span>
          {summary && (
            <>
              <RepeatIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{summary}</span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

/** A `YYYY-MM-DD` day as a short, locale-aware label (year only when off-year). */
function formatDay(day: string, lang: ReturnType<typeof useLang>): string {
  const [y, m, d] = day.split("-").map(Number);
  // Build the date at local midnight so the shown day matches the stored one.
  const date = new Date(y!, m! - 1, d!);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(bcp47(lang), {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Human recurrence summary, e.g. "every 2 weeks" — pluralised per unit. */
function recurrenceSummary(
  recurrence: Recurrence,
  t: ReturnType<typeof useT>,
): string {
  const { unit, interval } = recurrence;
  const one = interval === 1;
  if (unit === "week")
    return one
      ? t("app.timing.everyWeekOne")
      : t("app.timing.everyWeekOther", { n: interval });
  if (unit === "month")
    return one
      ? t("app.timing.everyMonthOne")
      : t("app.timing.everyMonthOther", { n: interval });
  return one
    ? t("app.timing.everyYearOne")
    : t("app.timing.everyYearOther", { n: interval });
}
