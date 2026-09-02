import { useId, useMemo, useRef, useState } from "react";

import {
  DEFAULT_DAYS_OF_WEEK,
  DEFAULT_RESET_HOUR,
  DEFAULT_RESET_MINUTE,
  nextResetAt,
  WEEKDAYS_MONDAY_FIRST,
} from "../domain/checklists.ts";
import type {
  Checklist,
  ResetSchedule,
  ResetSchedulePatch,
  ResetScheduleUnit,
} from "../domain/types.ts";
import { bcp47, useLang, useT } from "../i18n";
import type { Lang } from "../i18n/locale.ts";
import { FloatingPanel } from "./FloatingPanel.tsx";
import { Modal } from "./Modal.tsx";
import { Checkbox } from "./form/Checkbox.tsx";
import { SelectPicker } from "./form/SelectPicker.tsx";
import type { FloatingPlacement } from "./hooks/useFloatingPosition.ts";
import { CheckIcon, ChevronDownIcon, ClockIcon } from "./icons.tsx";

// The sheet the clock on a sidebar row opens: a checklist's whole reset
// schedule in one place — how often it turns over (every N days / weeks /
// months, or on chosen weekdays), the time of day it happens, and whether the
// freshly reset list should pop up over the screen the next time the app
// opens. Saving hands a `ResetSchedulePatch` to `setChecklistResetSchedule`,
// which stamps the cadence anchor; "Remove schedule" clears it.
//
// Every number is held as free-form text so mid-edit states — an empty field,
// a leading zero — don't fight a controlled number input (which coerces "" to
// 0 and then wedges on "03"), and each field selects its contents on focus so
// a tap-and-type replaces the value outright. Values normalise on blur and
// again on save.

type Props = {
  list: Checklist;
  onSubmit: (schedule: ResetSchedulePatch | null) => void;
  onClose: () => void;
};

const DAYS_PLACEMENT: Partial<FloatingPlacement> = {
  width: { kind: "min", minPx: 200 },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Weekday names in the active language, keyed by JS weekday index (0 = Sunday). */
function weekdayNames(
  lang: Lang,
  style: "long" | "short",
): Record<number, string> {
  const fmt = new Intl.DateTimeFormat(bcp47(lang), { weekday: style });
  const out: Record<number, string> = {};
  for (let d = 0; d < 7; d++) {
    // 2024-01-07 is a Sunday; local noon keeps the weekday stable in any zone.
    out[d] = fmt.format(new Date(2024, 0, 7 + d, 12));
  }
  return out;
}

// A digits-only text field: numeric keypad on mobile, contents selected on
// focus so typing replaces the value, non-digits dropped as they're typed.
function NumberField({
  value,
  onChange,
  onBlur,
  ariaLabel,
  className = "w-16",
}: {
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      aria-label={ariaLabel}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.currentTarget.value.replace(/[^0-9]/g, ""))}
      onBlur={onBlur}
      className={`${className} rounded border border-line bg-surface-2 px-2 py-1.5 text-center text-sm text-fg-bright focus:border-accent focus:outline-none`}
    />
  );
}

// The weekday multi-select: a trigger summarising the chosen days and a
// dropdown of seven checkable rows, Monday first. Each row is a
// `role="checkbox"` button so the whole row toggles and assistive tech hears
// the day's name and state.
function DaysPicker({
  days,
  onChange,
  lang,
  label,
  placeholder,
  everyDay,
}: {
  days: readonly number[];
  onChange: (next: number[]) => void;
  lang: Lang;
  label: string;
  placeholder: string;
  everyDay: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const long = useMemo(() => weekdayNames(lang, "long"), [lang]);
  const short = useMemo(() => weekdayNames(lang, "short"), [lang]);
  const chosen = new Set(days);
  const summary =
    chosen.size === 7
      ? everyDay
      : chosen.size === 0
        ? placeholder
        : WEEKDAYS_MONDAY_FIRST.filter((d) => chosen.has(d))
            .map((d) => short[d])
            .join(", ");
  const toggle = (d: number) => {
    const next = new Set(chosen);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange([...next].sort((a, b) => a - b));
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span
          className={`flex-1 truncate ${chosen.size === 0 ? "text-muted" : ""}`}
        >
          {summary}
        </span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
      </button>
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={{
          width: { kind: "min", minPx: 200 },
          anchor: "left",
          coordinateSpace: "document",
          ...DAYS_PLACEMENT,
        }}
        className="py-1"
      >
        <div role="group" aria-label={label}>
          {WEEKDAYS_MONDAY_FIRST.map((d) => {
            const on = chosen.has(d);
            return (
              <button
                key={d}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(d)}
                className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface"
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 items-center justify-center rounded-sm border-2 text-page-bg transition-colors ${
                    on ? "border-accent bg-accent" : "border-muted"
                  }`}
                >
                  <CheckIcon
                    className={`h-3 w-3 ${on ? "opacity-100" : "opacity-0"}`}
                  />
                </span>
                <span className="flex-1">{long[d]}</span>
              </button>
            );
          })}
        </div>
      </FloatingPanel>
    </>
  );
}

export function ResetScheduleModal({ list, onSubmit, onClose }: Props) {
  const t = useT();
  const lang = useLang();
  const headingId = useId();
  const existing = list.resetSchedule;

  const [unit, setUnit] = useState<ResetScheduleUnit>(existing?.unit ?? "day");
  const [intervalText, setIntervalText] = useState(
    String(existing?.interval ?? 1),
  );
  const [days, setDays] = useState<number[]>(() =>
    existing?.unit === "dayOfWeek"
      ? [...(existing.daysOfWeek ?? [])]
      : [...DEFAULT_DAYS_OF_WEEK],
  );
  const [hourText, setHourText] = useState(
    String(existing?.hour ?? DEFAULT_RESET_HOUR),
  );
  const [minuteText, setMinuteText] = useState(
    String(existing?.minute ?? DEFAULT_RESET_MINUTE).padStart(2, "0"),
  );
  const [popUp, setPopUp] = useState(existing?.popUp ?? false);

  const interval = Math.max(1, parseInt(intervalText, 10) || 1);
  const hour = clamp(parseInt(hourText, 10) || 0, 0, 23);
  const minute = clamp(parseInt(minuteText, 10) || 0, 0, 59);

  const unitOptions = [
    { value: "day" as const, label: t("app.resetSchedule.unitDay") },
    { value: "week" as const, label: t("app.resetSchedule.unitWeek") },
    { value: "month" as const, label: t("app.resetSchedule.unitMonth") },
    {
      value: "dayOfWeek" as const,
      label: t("app.resetSchedule.unitDayOfWeek"),
    },
  ];

  const patch: ResetSchedulePatch = {
    unit,
    interval,
    hour,
    minute,
    popUp,
    ...(unit === "dayOfWeek" ? { daysOfWeek: days } : {}),
  };
  // A weekday schedule with no weekdays never fires — refuse to save one.
  const canSave = unit !== "dayOfWeek" || days.length > 0;

  // A live preview of when the draft would first fire, anchored on this
  // instant the way the saved schedule will be. Read per render: the sheet is
  // short-lived, and a stale preview across midnight would mislead.
  const since = new Date().toISOString();
  const preview: ResetSchedule = { ...patch, since };
  const next = canSave ? nextResetAt(preview, since) : null;
  const nextLabel = next
    ? new Intl.DateTimeFormat(bcp47(lang), {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(next))
    : null;

  const save = () => {
    if (!canSave) return;
    onSubmit(patch);
    onClose();
  };

  const remove = () => {
    onSubmit(null);
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
        <div className="flex flex-col gap-1">
          <h2
            id={headingId}
            className="flex items-center gap-2 text-base font-semibold text-fg-bright"
          >
            <ClockIcon className="h-5 w-5 text-accent" />
            {t("app.resetSchedule.title")}
          </h2>
          <p className="text-xs text-muted">
            {t("app.resetSchedule.hint", { name: list.name })}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <span className={labelClass}>{t("app.resetSchedule.every")}</span>
          <div className="flex items-center gap-2">
            {unit !== "dayOfWeek" && (
              <NumberField
                value={intervalText}
                ariaLabel={t("app.resetSchedule.interval")}
                onChange={setIntervalText}
                onBlur={() => setIntervalText(String(interval))}
              />
            )}
            <div className="flex-1">
              <SelectPicker
                value={unit}
                options={unitOptions}
                onChange={(next) => setUnit(next)}
                ariaLabel={t("app.resetSchedule.every")}
              />
            </div>
          </div>
        </div>

        {unit === "dayOfWeek" && (
          <div className="flex flex-col gap-1">
            <span className={labelClass}>{t("app.resetSchedule.days")}</span>
            <DaysPicker
              days={days}
              onChange={setDays}
              lang={lang}
              label={t("app.resetSchedule.days")}
              placeholder={t("app.resetSchedule.pickDays")}
              everyDay={t("app.resetSchedule.everyDay")}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className={labelClass}>{t("app.resetSchedule.at")}</span>
          <div className="flex items-center gap-1">
            <NumberField
              value={hourText}
              ariaLabel={t("app.resetSchedule.hour")}
              onChange={setHourText}
              onBlur={() => setHourText(String(hour))}
            />
            <span className="text-sm text-muted">:</span>
            <NumberField
              value={minuteText}
              ariaLabel={t("app.resetSchedule.minute")}
              onChange={setMinuteText}
              onBlur={() => setMinuteText(String(minute).padStart(2, "0"))}
            />
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            checked={popUp}
            onChange={setPopUp}
            ariaLabel={t("app.resetSchedule.popUp")}
            className="pt-0.5"
          />
          <button
            type="button"
            onClick={() => setPopUp((v) => !v)}
            className="flex flex-1 cursor-pointer flex-col text-left"
          >
            <span className="text-sm text-fg-bright">
              {t("app.resetSchedule.popUp")}
            </span>
            <span className="text-xs text-muted">
              {t("app.resetSchedule.popUpHint")}
            </span>
          </button>
        </div>

        <p className="text-xs text-muted" aria-live="polite">
          {nextLabel
            ? t("app.resetSchedule.next", { when: nextLabel })
            : t("app.resetSchedule.never")}
        </p>

        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={!existing}
            className="text-sm text-danger hover:underline disabled:invisible"
          >
            {t("app.resetSchedule.remove")}
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
              disabled={!canSave}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-page-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
