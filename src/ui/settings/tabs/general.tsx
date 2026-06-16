import { useDevMode } from "../../../dev/useDevMode.ts";
import { useT } from "../../../i18n";
import { Section, ToggleRow } from "../shared.tsx";

// The landing tab. Holds the developer-mode switch (which reveals the
// Developer and Logs tabs when on). List-behaviour preferences live on
// their own Lists tab.
export function GeneralTab() {
  const t = useT();
  const { devMode, setDevMode } = useDevMode();
  return (
    <Section title={t("settings.general.title")}>
      <p className="text-xs text-muted">{t("settings.general.blurb")}</p>
      <ToggleRow
        label={t("settings.general.devMode")}
        hint={t("settings.general.devModeHint")}
        checked={devMode}
        onChange={setDevMode}
      />
    </Section>
  );
}
