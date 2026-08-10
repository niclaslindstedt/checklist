import { useId, useState } from "react";

import type {
  ChecklistItem,
  Recurrence,
  RecurrenceUnit,
  TimingPatch,
} from "../domain/types.ts";
import { useT } from "../i18n";
import { Modal } from "./Modal.tsx";
import { DatePicker } from "./form/DatePicker.tsx";
import { SelectPicker } from "./form/SelectPicker.tsx";
import { ClockIcon } from "./icons.tsx";

// The modal the clock affordance opens: an item's whole timing in one sheet —
// the earliest day it may be checked off ("Not before"), a due date, and,
// optionally, how that due date repeats (every N weeks / months / years).
//
// The two dates are independent: an item can be gated with no deadline, dated
// with no gate, or both — but they can't *cross*. A due date earlier than the
// gate describes work that must be finished before it may be started, so the
// due-date picker greys out every day before the chosen gate, and pushing the
// gate past an already-chosen due date clears that date rather than leaving an
// impossible pair behind.
//
// Recurrence is the other constraint — it's only offered once a due date is
// set, since a repeat needs an anchor day. Confirming hands all three back to
// `setTiming`; "Clear timing" drops every one of them at once.

// The recurrence unit, plus a "none" sentinel for the one-off / undated case.
type RepeatChoice = "none" | RecurrenceUnit;

type Props = {
  item: ChecklistItem;
  onSubmit: (timing: TimingPatch) => void;
  onClose: () => void;
};

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
  // The interval is held as free-form text so mid-edit states — an empty
  // field, a leading zero — don't fight a controlled number input (which
  // coerces "" to 0 and then wedges on "03"). It's normalised to a valid
  // integer on blur and again on save.
  const [intervalText, setIntervalText] = useState(
    String(item.recurrence?.interval ?? 1),
  );

  const parsedInterval = Math.max(1, parseInt(intervalText, 10) || 1);

  const repeatOptions = [
    { value: "none" as const, label: t("app.timing.noRepeat") },
    { value: "week" as const, label: t("app.timing.unitWeek") },
    { value: "month" as const, label: t("app.timing.unitMonth") },
    { value: "year" as const, label: t("app.timing.unitYear") },
  ];

  const save = () => {
    const deadline = date || null;
    // Recurrence only rides with a due date, and only when a real unit is chosen.
    const recurrence: Recurrence | null =
      deadline && unit !== "none" ? { unit, interval: parsedInterval } : null;
    onSubmit({ notBefore: notBefore || null, deadline, recurrence });
    onClose();
  };

  const clear = () => {
    onSubmit({ notBefore: null, deadline: null, recurrence: null });
    onClose();
  };

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
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("app.timing.notBefore")}
          </span>
          <DatePicker
            value={notBefore}
            onChange={changeNotBefore}
            ariaLabel={t("app.timing.notBefore")}
            placeholder={t("app.timing.pickDate")}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("app.timing.dueDate")}
          </span>
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
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("app.timing.repeat")}
          </span>
          <div className="flex items-center gap-2">
            {unit !== "none" && (
              <>
                <span className="text-sm text-muted">
                  {t("app.timing.every")}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={intervalText}
                  aria-label={t("app.timing.interval")}
                  disabled={!date}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) =>
                    setIntervalText(
                      e.currentTarget.value.replace(/[^0-9]/g, ""),
                    )
                  }
                  onBlur={() => setIntervalText(String(parsedInterval))}
                  className="w-16 rounded border border-line bg-surface-2 px-2 py-1.5 text-center text-sm text-fg-bright focus:border-accent focus:outline-none disabled:opacity-50"
                />
              </>
            )}
            <div className={unit === "none" ? "flex-1" : ""}>
              <SelectPicker
                value={unit}
                options={repeatOptions}
                onChange={(next) => setUnit(next)}
                ariaLabel={t("app.timing.repeat")}
                disabled={!date}
              />
            </div>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={!item.deadline && !item.notBefore}
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
