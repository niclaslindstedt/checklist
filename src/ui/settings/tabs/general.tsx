import { useDevMode } from "../../../dev/useDevMode.ts";
import { useLang, useT } from "../../../i18n";
import { writeLanguagePreference } from "../../../i18n/language-preference.ts";
import { useStandaloneMobile } from "../../../pwa/standalone.ts";
import type { Settings } from "../../../settings/types.ts";
import type { UpdateSetting } from "../../../settings/useSettings.ts";
import { LanguagePicker } from "../../LanguagePicker.tsx";
import { Section, ToggleRow } from "../shared.tsx";

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
