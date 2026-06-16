import { useDevMode } from "../../../dev/useDevMode.ts";
import { useT } from "../../../i18n";
import type { Settings } from "../../../settings/types.ts";
import type { UpdateSetting } from "../../../settings/useSettings.ts";
import { Field, SegmentedRow, Section, ToggleRow } from "../shared.tsx";

// The landing tab. Holds the developer-mode switch (which reveals the
// Developer and Logs tabs when on) and general list-behaviour preferences.
export function GeneralTab({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: UpdateSetting;
}) {
  const t = useT();
  const { devMode, setDevMode } = useDevMode();
  return (
    <>
      <Section title={t("settings.general.title")}>
        <p className="text-xs text-muted">{t("settings.general.blurb")}</p>
        <ToggleRow
          label={t("settings.general.devMode")}
          hint={t("settings.general.devModeHint")}
          checked={devMode}
          onChange={setDevMode}
        />
      </Section>
      <Section title={t("settings.general.listTitle")}>
        <Field label={t("settings.general.addItemPosition")}>
          <SegmentedRow
            value={settings.addItemPosition}
            ariaLabel={t("settings.general.addItemPosition")}
            options={[
              { value: "top", label: t("settings.general.addItemTop") },
              { value: "bottom", label: t("settings.general.addItemBottom") },
            ]}
            onChange={(v) => onUpdate("addItemPosition", v)}
          />
        </Field>
        <p className="text-xs text-muted">
          {t("settings.general.addItemPositionHint")}
        </p>
      </Section>
    </>
  );
}
