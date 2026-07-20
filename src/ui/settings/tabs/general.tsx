import { useDevMode } from "../../../dev/useDevMode.ts";
import { useLang, useT } from "../../../i18n";
import { writeLanguagePreference } from "../../../i18n/language-preference.ts";
import { useStandaloneMobile } from "../../../pwa/standalone.ts";
import { isNotificationsAvailable } from "../../../storage/native-bridge.ts";
import type { Settings } from "../../../settings/types.ts";
import type { UpdateSetting } from "../../../settings/useSettings.ts";
import { LanguagePicker } from "../../LanguagePicker.tsx";
import { Section, ToggleRow } from "../shared.tsx";

// The lead-time offsets the picker offers, paired with their label key. Kept
// in sync with `ALLOWED_LEAD_DAYS` in `domain/notification-schedule.ts`.
const LEAD_OFFSETS: { days: number; labelKey: string }[] = [
  { days: 0, labelKey: "settings.general.reminderLeadOnDay" },
  { days: 1, labelKey: "settings.general.reminderLeadDayBefore" },
  { days: 7, labelKey: "settings.general.reminderLeadWeekBefore" },
];

// The landing tab. One bordered section per concern (mirroring the budget
// project's General tab): the language picker (flag buttons that switch the
// app's language live), the menu-button toggle (installed PWA on a phone /
// tablet only), the toast-suppression toggle, the achievements switch, and
// the developer-mode switch that reveals the Developer and Logs tabs.
// List-behaviour preferences live on the Lists tab.
export function GeneralTab({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: UpdateSetting;
}) {
  const t = useT();
  const lang = useLang();
  const { devMode, setDevMode } = useDevMode();
  const standaloneMobile = useStandaloneMobile();
  // Deadline reminders only exist in the native wrapper — the web build can't
  // fire an OS notification, so the whole block stays hidden there.
  const nativeNotifications = isNotificationsAvailable();

  // Add or remove a lead-time offset from the set, keeping it sorted.
  const toggleLead = (days: number, on: boolean) => {
    const next = on
      ? [...new Set([...settings.reminderLeadDays, days])].sort((a, b) => a - b)
      : settings.reminderLeadDays.filter((d) => d !== days);
    onUpdate("reminderLeadDays", next);
  };

  return (
    <>
      <p className="mb-3 text-xs text-muted">{t("settings.general.blurb")}</p>

      <Section title={t("settings.general.languageSection")}>
        <LanguagePicker value={lang} onChange={writeLanguagePreference} />
        <p className="text-xs text-muted">
          {t("settings.general.languageHint")}
        </p>
      </Section>

      {standaloneMobile && (
        <Section title={t("settings.general.interfaceSection")}>
          <ToggleRow
            label={t("settings.general.menuButton")}
            hint={t("settings.general.menuButtonHint")}
            checked={settings.showMenuButton}
            onChange={(next) => onUpdate("showMenuButton", next)}
          />
        </Section>
      )}

      <Section title={t("settings.general.notificationsSection")}>
        <ToggleRow
          label={t("settings.general.disableToasts")}
          hint={t("settings.general.disableToastsHint")}
          checked={settings.disableToasts}
          onChange={(next) => onUpdate("disableToasts", next)}
        />
        {nativeNotifications && (
          <>
            <ToggleRow
              label={t("settings.general.deadlineReminders")}
              hint={t("settings.general.deadlineRemindersHint")}
              checked={settings.deadlineReminders}
              onChange={(next) => onUpdate("deadlineReminders", next)}
            />
            {settings.deadlineReminders && (
              <fieldset className="ml-8 flex flex-col gap-3 border-0 p-0">
                <legend className="text-xs text-muted">
                  {t("settings.general.reminderLeadTimes")}
                </legend>
                {LEAD_OFFSETS.map(({ days, labelKey }) => (
                  <ToggleRow
                    key={days}
                    label={t(labelKey as Parameters<typeof t>[0])}
                    checked={settings.reminderLeadDays.includes(days)}
                    onChange={(next) => toggleLead(days, next)}
                  />
                ))}
              </fieldset>
            )}
          </>
        )}
      </Section>

      <Section title={t("settings.general.achievementsSection")}>
        <ToggleRow
          label={t("settings.general.disableAchievements")}
          hint={t("settings.general.disableAchievementsHint")}
          checked={settings.disableAchievements}
          onChange={(next) => onUpdate("disableAchievements", next)}
        />
      </Section>

      <Section title={t("settings.general.developerSection")}>
        <ToggleRow
          label={t("settings.general.devMode")}
          hint={t("settings.general.devModeHint")}
          checked={devMode}
          onChange={setDevMode}
        />
      </Section>
    </>
  );
}
