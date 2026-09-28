import { useState } from "react";

import { dayPeriodLabels, usesTwelveHourClock } from "../../i18n/locale.ts";
import { readHour, toTwelveHour } from "../../domain/time-of-day.ts";
import { NumberField } from "./NumberField.tsx";

// An hour and a minute, typed the way the device's clock reads. A 24-hour
// locale (en-GB, sv-SE) gets `HH : MM`; a 12-hour one (en-US) gets
// `h : MM` and an AM / PM pair beside it, so "7" with PM is seven in the
// evening. The value in and out is always the 24-hour pair the data holds.
//
// Both clocks are accepted either way: typing 0 or 13–23 into a 12-hour field
// is read as a 24-hour hour, and the field turns it into its own reading on
// blur ("19" becomes "7" with PM lit), since someone used to a 24-hour clock
// will type one.
//
// Like `NumberField`, each field holds free-form text while it is being edited
// and normalises on blur; `onChange` reports the value it currently reads as
// on every keystroke, so the caller can save without waiting for a blur.

type Props = {
  /** The time the fields start from, as 24-hour numbers. */
  hour: number;
  minute: number;
  /** The locale whose clock the fields follow (`bcp47(lang)`). */
  locale: string;
  onChange: (hour: number, minute: number) => void;
  hourLabel: string;
  minuteLabel: string;
  /** The accessible name of the AM / PM pair. */
  periodLabel: string;
  /** Width utility for each number field. */
  fieldClassName?: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function TimeOfDayField({
  hour: initialHour,
  minute: initialMinute,
  locale,
  onChange,
  hourLabel,
  minuteLabel,
  periodLabel,
  fieldClassName = "w-14",
}: Props) {
  const twelveHour = usesTwelveHourClock(locale);
  const [am, pmLabel] = dayPeriodLabels(locale);
  const start = toTwelveHour(initialHour);
  const [hourText, setHourText] = useState(
    twelveHour ? String(start.hour) : String(initialHour),
  );
  const [pm, setPm] = useState(start.pm);
  const [minuteText, setMinuteText] = useState(pad(initialMinute));

  const hour = readHour(hourText, twelveHour, pm);
  const minute = clamp(parseInt(minuteText, 10) || 0, 0, 59);

  const changeHour = (text: string) => {
    setHourText(text);
    onChange(readHour(text, twelveHour, pm), minute);
  };
  const changeMinute = (text: string) => {
    setMinuteText(text);
    onChange(hour, clamp(parseInt(text, 10) || 0, 0, 59));
  };
  const changePeriod = (nextPm: boolean) => {
    // The typed hour keeps its face value under the other period; a 24-hour
    // hour still in the field was read on its own and is shown in 12-hour
    // form first, so the period applies to what the user sees.
    const shown = toTwelveHour(hour).hour;
    setHourText(String(shown));
    setPm(nextPm);
    onChange(readHour(String(shown), true, nextPm), minute);
  };
  const blurHour = () => {
    if (!twelveHour) {
      setHourText(String(hour));
      return;
    }
    const read = toTwelveHour(hour);
    setHourText(String(read.hour));
    setPm(read.pm);
  };

  const periodButton = (isPm: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={pm === isPm}
      onClick={() => changePeriod(isPm)}
      className={`px-2 py-1.5 text-xs font-semibold ${
        pm === isPm
          ? "bg-accent text-page-bg"
          : "bg-surface-2 text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      <NumberField
        value={hourText}
        ariaLabel={hourLabel}
        onChange={changeHour}
        onBlur={blurHour}
        className={fieldClassName}
      />
      <span className="text-sm text-muted">:</span>
      <NumberField
        value={minuteText}
        ariaLabel={minuteLabel}
        onChange={changeMinute}
        onBlur={() => setMinuteText(pad(minute))}
        className={fieldClassName}
      />
      {twelveHour && (
        <div
          role="group"
          aria-label={periodLabel}
          className="ml-1 flex overflow-hidden rounded border border-line"
        >
          {periodButton(false, am)}
          {periodButton(true, pmLabel)}
        </div>
      )}
    </div>
  );
}
