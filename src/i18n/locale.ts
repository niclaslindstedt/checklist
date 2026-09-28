// Helpers around the app's two-letter language code. Kept tiny and
// standalone (no vdom, no catalog modules) so non-component callers can
// import it freely. Mirrors budget's `locale.ts`, trimmed to what the
// checklist app needs.

export type Lang = "en" | "sv";

export const SUPPORTED_LANGS: readonly Lang[] = ["en", "sv"];

// The device's own locale tag ("en-US", "en-GB", "de-DE", …), or "" when
// there is no navigator (Node, prerender).
export function deviceLocale(): string {
  if (typeof navigator === "undefined") return "";
  return navigator.language ?? "";
}

// The concrete locale every Intl formatter uses for `lang`. The language
// picks the words; the device picks the formats. Swedish is always `sv-SE`.
// English follows the device: an English device keeps its own tag, so
// `en-US` prints "Sep 27" with a 12-hour clock and a Sunday week while
// `en-GB` prints "27 Sept" with a Monday one; any other device lends its
// region (`de-DE` → `en-DE`), and a device without one reads as `en-US`, the
// app's one English (US spelling).
export function bcp47(lang: Lang, device: string = deviceLocale()): string {
  if (lang === "sv") return "sv-SE";
  const tag = parseLocale(device);
  if (!tag) return "en-US";
  if (tag.language === "en") return tag.baseName;
  return tag.region ? `en-${tag.region}` : "en-US";
}

function parseLocale(tag: string): Intl.Locale | null {
  if (!tag) return null;
  try {
    return new Intl.Locale(tag);
  } catch {
    return null;
  }
}

// Regions whose calendars start on Sunday, for engines without
// `Intl.Locale#getWeekInfo` (Firefox before 130). Everything else starts on
// Monday — the ISO week, and what Swedish and British calendars use.
const SUNDAY_FIRST_REGIONS = new Set([
  "US",
  "CA",
  "MX",
  "BR",
  "JP",
  "KR",
  "TW",
  "HK",
  "IL",
  "PH",
  "IN",
  "ZA",
]);

type WeekInfo = { firstDay: number };
type LocaleWithWeekInfo = Intl.Locale & {
  getWeekInfo?: () => WeekInfo;
  weekInfo?: WeekInfo;
};

// The weekday a calendar in `locale` starts on (0 = Sunday … 6 = Saturday).
export function weekStartsOn(locale: string): number {
  const parsed = parseLocale(locale) as LocaleWithWeekInfo | null;
  if (!parsed) return 1;
  try {
    const info = parsed.getWeekInfo?.() ?? parsed.weekInfo;
    // Intl numbers the days 1 = Monday … 7 = Sunday.
    if (info) return info.firstDay % 7;
  } catch {
    // An engine that knows the method but not the locale: use the table.
  }
  const region = parsed.maximize().region ?? "";
  return SUNDAY_FIRST_REGIONS.has(region) ? 0 : 1;
}

// Intl options for a time of day in `locale`: "7:05 AM" where the clock is
// 12-hour, "07:05" where it is 24-hour.
export function timeOfDayOptions(locale: string): Intl.DateTimeFormatOptions {
  const cycle = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
  }).resolvedOptions().hourCycle;
  const twelveHour = cycle === "h11" || cycle === "h12";
  return { hour: twelveHour ? "numeric" : "2-digit", minute: "2-digit" };
}

// A stored `HH:MM` time of day, formatted for `locale`.
export function formatTimeOfDay(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return new Intl.DateTimeFormat(locale, timeOfDayOptions(locale)).format(
    new Date(2024, 0, 1, h, m),
  );
}

// Consulted only when no preference is stored yet. Anything whose
// `navigator.language` starts with `sv` → Swedish; everything else →
// English.
export function detectInitialLanguage(): Lang {
  if (typeof navigator === "undefined") return "en";
  const raw = navigator.language ?? "";
  return raw.toLowerCase().startsWith("sv") ? "sv" : "en";
}
