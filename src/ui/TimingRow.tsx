import {
  deadlineStatus,
  isHeldBack,
  type DeadlineStatus,
} from "../domain/checklists.ts";
import type { Recurrence } from "../domain/types.ts";
import { bcp47, useLang, useT } from "../i18n";
import { ClockIcon, RepeatIcon } from "./icons.tsx";

// The slim "date row" shown above a checklist item that carries any timing: a
// small, narrow line stating the earliest day the item may be checked off
// ("Not before …"), its due date (with a repeat glyph for a recurring one), or
// both.
//
// The two halves read very differently on purpose:
//
//   • The **due date** is colour-coded by how soon it is — muted while it's
//     far off, warming through yellow (within a week) and orange (within a
//     day) to red once it's overdue. The urgency bucket is `deadlineStatus`
//     from the domain.
//   • The **not-before** date carries no urgency at all: nothing is late, the
//     item simply isn't open yet, so it stays muted whatever the distance. It
//     is also *temporary* — the row shows it only while the day is still in
//     the future, and it disappears the moment the day arrives, leaving an
//     ordinary (or merely dated) item behind. That's why the hold and its
//     label are one and the same test: `isHeldBack`.
//
// Formatting the dates and the recurrence summary is a presentation concern
// and lives here; the buckets and the hold test are pure domain.

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
};

// The `ml-8` lines the row up under the item title (past the caret + checkbox
// columns); the enclosing foreground already carries the nesting indent, so a
// sub-item's date row shifts right with it automatically.
export function TimingRow({ notBefore, deadline, recurrence }: Props) {
  const t = useT();
  const lang = useLang();
  const now = new Date().toISOString();
  // A passed not-before date has done its job and is dropped from the row —
  // the same test that releases the checkbox hides the label.
  const held = isHeldBack({ notBefore }, now);
  const status = deadline ? deadlineStatus(deadline, now) : null;
  const summary = recurrence ? recurrenceSummary(recurrence, t) : null;

  if (!held && !deadline) return null;

  return (
    <div className="ml-8 flex items-center gap-1 pt-1 text-[0.7rem] leading-none font-medium tracking-wide">
      {held && (
        <span className="flex items-center gap-1 truncate text-muted">
          <ClockIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {t("app.timing.notBeforeLabel", {
              date: formatDay(notBefore!, lang),
            })}
          </span>
        </span>
      )}
      {/* Both dates on one line: the gate reads muted, the due date keeps its
          own urgency colour, and a middle dot separates them when an item
          carries both. */}
      {held && deadline && <span className="text-muted">·</span>}
      {deadline && status && (
        <span
          className={`flex items-center gap-1 truncate ${STATUS_CLASS[status]}`}
        >
          {!held && <ClockIcon className="h-3 w-3 shrink-0" />}
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
