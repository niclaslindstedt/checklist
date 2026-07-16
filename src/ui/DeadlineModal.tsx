import { useId, useState } from "react";

import type {
  ChecklistItem,
  Recurrence,
  RecurrenceUnit,
} from "../domain/types.ts";
import { useT } from "../i18n";
import { Modal } from "./Modal.tsx";
import { DatePicker } from "./form/DatePicker.tsx";
import { SelectPicker } from "./form/SelectPicker.tsx";
import { ClockIcon } from "./icons.tsx";

// The modal the clock affordance opens: pick a due date for an item and,
// optionally, how it repeats (every N weeks / months / years). Confirming
// hands the chosen date + recurrence back to `setDeadline`; recurrence is only
// offered once a date is set, since a repeat needs an anchor day. Clearing the
// date drops the deadline (and any recurrence) entirely.

// The recurrence unit, plus a "none" sentinel for the one-off / undated case.
type RepeatChoice = "none" | RecurrenceUnit;

type Props = {
  item: ChecklistItem;
  onSubmit: (deadline: string | null, recurrence: Recurrence | null) => void;
  onClose: () => void;
};

export function DeadlineModal({ item, onSubmit, onClose }: Props) {
  const t = useT();
  const headingId = useId();

  const [date, setDate] = useState(item.deadline ?? "");
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
    { value: "none" as const, label: t("app.deadline.noRepeat") },
    { value: "week" as const, label: t("app.deadline.unitWeek") },
    { value: "month" as const, label: t("app.deadline.unitMonth") },
    { value: "year" as const, label: t("app.deadline.unitYear") },
  ];

  const save = () => {
    const deadline = date || null;
    // Recurrence only rides with a date, and only when a real unit is chosen.
    const recurrence: Recurrence | null =
      deadline && unit !== "none" ? { unit, interval: parsedInterval } : null;
    onSubmit(deadline, recurrence);
    onClose();
  };

  const clear = () => {
    onSubmit(null, null);
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
          {t("app.deadline.title")}
        </h2>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("app.deadline.dueDate")}
          </span>
          <DatePicker
            value={date}
            onChange={setDate}
            ariaLabel={t("app.deadline.dueDate")}
            placeholder={t("app.deadline.pickDate")}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted uppercase">
            {t("app.deadline.repeat")}
          </span>
          <div className="flex items-center gap-2">
            {unit !== "none" && (
              <>
                <span className="text-sm text-muted">
                  {t("app.deadline.every")}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={intervalText}
                  aria-label={t("app.deadline.interval")}
                  disabled={!date}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) =>
                    setIntervalText(e.target.value.replace(/[^0-9]/g, ""))
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
                ariaLabel={t("app.deadline.repeat")}
                disabled={!date}
              />
            </div>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={!item.deadline}
            className="text-sm text-danger hover:underline disabled:invisible"
          >
            {t("app.deadline.clear")}
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
