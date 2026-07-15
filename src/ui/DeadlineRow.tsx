import { deadlineStatus, type DeadlineStatus } from "../domain/checklists.ts";
import type { Recurrence } from "../domain/types.ts";
import { bcp47, useLang, useT } from "../i18n";
import { ClockIcon, RepeatIcon } from "./icons.tsx";

// The slim "date row" shown above a dated checklist item: a small, narrow line
// carrying the due date (and a repeat glyph for a recurring one), colour-coded
// by how soon the deadline is — muted while it's far off, warming through
// yellow (within a week) and orange (within a day) to red once it's overdue.
// The urgency bucket is `deadlineStatus` from the domain; formatting the date
// and the recurrence summary is a presentation concern and lives here.

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
  deadline: string;
  recurrence?: Recurrence;
};

// The `ml-8` lines the row up under the item title (past the caret + checkbox
// columns); the enclosing foreground already carries the nesting indent, so a
// sub-item's date row shifts right with it automatically.
export function DeadlineRow({ deadline, recurrence }: Props) {
  const t = useT();
  const lang = useLang();
  const status = deadlineStatus(deadline, new Date().toISOString());
  const label = formatDeadline(deadline, lang);
  const summary = recurrence ? recurrenceSummary(recurrence, t) : null;

  return (
    <div
      className={`ml-8 flex items-center gap-1 pt-1 text-[0.7rem] leading-none font-medium tracking-wide ${STATUS_CLASS[status]}`}
    >
      <ClockIcon className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {status === "overdue"
          ? `${t("app.deadline.overdue")} · ${label}`
          : label}
      </span>
      {summary && (
        <>
          <RepeatIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{summary}</span>
        </>
      )}
    </div>
  );
}

/** A `YYYY-MM-DD` day as a short, locale-aware label (year only when off-year). */
function formatDeadline(
  deadline: string,
  lang: ReturnType<typeof useLang>,
): string {
  const [y, m, d] = deadline.split("-").map(Number);
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
      ? t("app.deadline.everyWeekOne")
      : t("app.deadline.everyWeekOther", { n: interval });
  if (unit === "month")
    return one
      ? t("app.deadline.everyMonthOne")
      : t("app.deadline.everyMonthOther", { n: interval });
  return one
    ? t("app.deadline.everyYearOne")
    : t("app.deadline.everyYearOther", { n: interval });
}
