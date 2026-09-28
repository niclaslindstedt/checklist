// Reading an hour on a 12-hour clock, for the time-of-day fields
// (`src/ui/form/TimeOfDayField.tsx`). The data always holds 24-hour numbers;
// these translate to and from what a 12-hour clock shows.

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** A 24-hour hour as a 12-hour clock reads it: 0 → 12 AM, 13 → 1 PM. */
export function toTwelveHour(hour: number): { hour: number; pm: boolean } {
  return { hour: hour % 12 === 0 ? 12 : hour % 12, pm: hour >= 12 };
}

/**
 * The 24-hour hour a typed hour means. On a 12-hour clock 1–12 are read with
 * the chosen period (12 AM is midnight, 12 PM noon); anything else is taken as
 * a 24-hour hour, clamped to the day.
 */
export function readHour(
  text: string,
  twelveHour: boolean,
  pm: boolean,
): number {
  const typed = parseInt(text, 10) || 0;
  if (twelveHour && typed >= 1 && typed <= 12) {
    return (typed % 12) + (pm ? 12 : 0);
  }
  return clamp(typed, 0, 23);
}
