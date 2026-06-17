import { useDevMode } from "../../../dev/useDevMode.ts";
import { useT } from "../../../i18n";
import { useStandaloneMobile } from "../../../pwa/standalone.ts";
import type { Settings } from "../../../settings/types.ts";
import type { UpdateSetting } from "../../../settings/useSettings.ts";
import { Section, ToggleRow } from "../shared.tsx";

// The landing tab. Holds the developer-mode switch (which reveals the
// Developer and Logs tabs when on), the toggle that suppresses the general
// toast stack, the toggle that switches the achievements system off, and —
// only in the installed PWA on a phone / tablet — the toggle that hides the
// floating menu button in favour of an inward edge swipe. List-behaviour
// preferences live on the Lists tab.
export function GeneralTab({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: UpdateSetting;
}) {
  const t = useT();
  const { devMode, setDevMode } = useDevMode();
  const standaloneMobile = useStandaloneMobile();
  return (
    <Section title={t("settings.general.title")}>
      <p className="text-xs text-muted">{t("settings.general.blurb")}</p>
      {standaloneMobile && (
        <ToggleRow
          label={t("settings.general.menuButton")}
          hint={t("settings.general.menuButtonHint")}
          checked={settings.showMenuButton}
          onChange={(next) => onUpdate("showMenuButton", next)}
        />
      )}
      <ToggleRow
        label={t("settings.general.disableToasts")}
        hint={t("settings.general.disableToastsHint")}
        checked={settings.disableToasts}
        onChange={(next) => onUpdate("disableToasts", next)}
      />
      <ToggleRow
        label={t("settings.general.disableAchievements")}
        hint={t("settings.general.disableAchievementsHint")}
        checked={settings.disableAchievements}
        onChange={(next) => onUpdate("disableAchievements", next)}
      />
      <ToggleRow
        label={t("settings.general.devMode")}
        hint={t("settings.general.devModeHint")}
        checked={devMode}
        onChange={setDevMode}
      />
    </Section>
  );
}
