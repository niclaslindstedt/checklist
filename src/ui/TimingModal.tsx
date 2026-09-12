import { useId, useState } from "react";

import { DEFAULT_REFRESH_TIME } from "../domain/checklists.ts";
import type {
  ChecklistItem,
  Recurrence,
  RecurrenceUnit,
  TimingPatch,
} from "../domain/types.ts";
import { useT } from "../i18n";
import { Modal } from "./Modal.tsx";
import { DatePicker } from "./form/DatePicker.tsx";
import { NumberField } from "./form/NumberField.tsx";
import { SelectPicker } from "./form/SelectPicker.tsx";
import { ClockIcon } from "./icons.tsx";

// The modal the clock affordance opens: an item's whole timing in one sheet —
// the earliest day it may be checked off ("Not before"), a due date, and how
// the item repeats (every N days / weeks / months / years).
//
// The two dates are independent: an item can be gated with no deadline, dated
// with no gate, or both — but they can't *cross*. A due date earlier than the
// gate describes work that must be finished before it may be started, so the
// due-date picker greys out every day before the chosen gate, and pushing the
// gate past an already-chosen due date clears that date rather than leaving an
// impossible pair behind.
//
// The repeat stands apart from both, and what it means depends on whether a
// due date is set beside it:
//
//   • **With a due date** it rolls that date — checking the item moves the
//     deadline on one interval instead of ticking it off.
//   • **On its own** it is a *refresh*: the item is checked off like any
//     other, and comes back unchecked at the top of the list once the cadence
//     comes round. "Buy milk every week or so" has a rhythm but no deadline,
//     and asking for one to unlock the other only ever invented a date the
//     user didn't mean.
//
// A daily repeat also picks the time of day it comes back, since "every day"
// without an hour would turn over at whatever moment the last box was ticked.
// The coarser cadences don't ask: a week's drift either way is noise.
//
// Confirming hands all three back to `setTiming`; "Clear timing" drops every
// one of them at once.

// The recurrence unit, plus a "none" sentinel for the one-off case.
type RepeatChoice = "none" | RecurrenceUnit;

type Props = {
  item: ChecklistItem;
  onSubmit: (timing: TimingPatch) => void;
  onClose: () => void;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Split an `HH:MM` time (or the daily default) into its two numbers. */
function splitTime(at: string | undefined): [number, number] {
  const [h, m] = (at ?? DEFAULT_REFRESH_TIME).split(":").map(Number);
  return [clamp(h ?? 0, 0, 23), clamp(m ?? 0, 0, 59)];
}

export function TimingModal({ item, onSubmit, onClose }: Props) {
  const t = useT();
  const headingId = useId();

  const [notBefore, setNotBefore] = useState(item.notBefore ?? "");
  const [date, setDate] = useState(item.deadline ?? "");

  // Moving the gate past the due date would leave an item that can't be
  // started until after it was meant to be finished. The due-date picker
  // refuses to *offer* such a day (`min` below), so the only way in is to push
  // the gate forward past a date already chosen — in which case that date is
  // dropped, visibly, as the field empties under the user's hand. Silently
  // keeping an unreachable due date would be worse: it would sit there
  // colour-coded and urgent for work that isn't open yet.
  const changeNotBefore = (next: string) => {
    setNotBefore(next);
    if (next && date && date < next) setDate("");
  };
  const [unit, setUnit] = useState<RepeatChoice>(
    item.recurrence?.unit ?? "none",
  );
  // The interval and the time of day are held as free-form text so mid-edit
  // states — an empty field, a leading zero — don't fight a controlled number
  // input (see `NumberField`). Each normalises on blur and again on save.
  const [intervalText, setIntervalText] = useState(
    String(item.recurrence?.interval ?? 1),
  );
  const [initialHour, initialMinute] = splitTime(item.recurrence?.at);
  const [hourText, setHourText] = useState(String(initialHour));
  const [minuteText, setMinuteText] = useState(pad(initialMinute));

  const parsedInterval = Math.max(1, parseInt(intervalText, 10) || 1);
  const hour = clamp(parseInt(hourText, 10) || 0, 0, 23);
  const minute = clamp(parseInt(minuteText, 10) || 0, 0, 59);

  const repeatOptions = [
    { value: "none" as const, label: t("app.timing.noRepeat") },
    { value: "day" as const, label: t("app.timing.unitDay") },
    { value: "week" as const, label: t("app.timing.unitWeek") },
    { value: "month" as const, label: t("app.timing.unitMonth") },
    { value: "year" as const, label: t("app.timing.unitYear") },
  ];

  const buildRecurrence = (): Recurrence | null => {
    if (unit === "none") return null;
    const rec: Recurrence = { unit, interval: parsedInterval };
    // Only a daily repeat carries a time — it's the only cadence fine-grained
    // enough for the hour to matter.
    if (unit === "day") rec.at = `${pad(hour)}:${pad(minute)}`;
    return rec;
  };

  const save = () => {
    onSubmit({
      notBefore: notBefore || null,
      deadline: date || null,
      recurrence: buildRecurrence(),
    });
    onClose();
  };

  const clear = () => {
    onSubmit({ notBefore: null, deadline: null, recurrence: null });
    onClose();
  };

  const labelClass = "text-xs font-medium tracking-wide text-muted uppercase";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy={headingId}
      centered
      size="max-w-sm"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2
          id={headingId}
          className="flex items-center gap-2 text-base font-semibold text-fg-bright"
        >
          <ClockIcon className="h-5 w-5 text-accent" />
          {t("app.timing.title")}
        </h2>

        {/* "Not before" sits above the due date: it gates the *start* of the
            work, so it reads first, ahead of when the work is due. */}
        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t("app.timing.notBefore")}</span>
          <DatePicker
            value={notBefore}
            onChange={changeNotBefore}
            ariaLabel={t("app.timing.notBefore")}
            placeholder={t("app.timing.pickDate")}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className={labelClass}>{t("app.timing.dueDate")}</span>
          {/* A due date before the gate is unreachable work, so the picker
              simply doesn't offer those days. */}
          <DatePicker
            value={date}
            onChange={setDate}
            ariaLabel={t("app.timing.dueDate")}
            placeholder={t("app.timing.pickDate")}
            min={notBefore || undefined}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>{t("app.timing.repeat")}</span>
          <div className="flex items-center gap-2">
            {unit !== "none" && (
              <>
                <span className="text-sm text-muted">
                  {t("app.timing.every")}
                </span>
                <NumberField
                  value={intervalText}
                  ariaLabel={t("app.timing.interval")}
                  onChange={setIntervalText}
                  onBlur={() => setIntervalText(String(parsedInterval))}
                />
              </>
            )}
            <div className={unit === "none" ? "flex-1" : ""}>
              <SelectPicker
                value={unit}
                options={repeatOptions}
                onChange={(next) => setUnit(next)}
                ariaLabel={t("app.timing.repeat")}
              />
            </div>
          </div>
          {unit === "day" && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-muted">{t("app.timing.at")}</span>
              <NumberField
                value={hourText}
                ariaLabel={t("app.timing.hour")}
                onChange={setHourText}
                onBlur={() => setHourText(String(hour))}
                className="w-14"
              />
              <span className="text-sm text-muted">:</span>
              <NumberField
                value={minuteText}
                ariaLabel={t("app.timing.minute")}
                onChange={setMinuteText}
                onBlur={() => setMinuteText(pad(minute))}
                className="w-14"
              />
            </div>
          )}
          {/* A repeat with no due date behaves differently enough to be worth
              a line: nothing is ever late, the item simply comes back. */}
          {unit !== "none" && !date && (
            <p className="mt-1 text-xs text-muted">
              {t("app.timing.refreshHint")}
            </p>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={!item.deadline && !item.notBefore && !item.recurrence}
            className="text-sm text-danger hover:underline disabled:invisible"
          >
            {t("app.timing.clear")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-line px-3 py-1.5 text-sm text-fg hover:bg-surface-2"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-page-bg hover:opacity-90"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
