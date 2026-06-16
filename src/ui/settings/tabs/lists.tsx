import { useT } from "../../../i18n";
import type { Settings } from "../../../settings/types.ts";
import type { UpdateSetting } from "../../../settings/useSettings.ts";
import { Field, SegmentedRow, Section } from "../shared.tsx";

// List-behaviour preferences — where a newly added item lands, and any
// other per-list settings that govern the checklist view rather than the
// app chrome or appearance.
export function ListsTab({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: UpdateSetting;
}) {
  const t = useT();
  return (
    <Section title={t("settings.lists.title")}>
      <Field label={t("settings.lists.addItemPosition")}>
        <SegmentedRow
          value={settings.addItemPosition}
          ariaLabel={t("settings.lists.addItemPosition")}
          options={[
            { value: "top", label: t("settings.lists.addItemTop") },
            { value: "bottom", label: t("settings.lists.addItemBottom") },
          ]}
          onChange={(v) => onUpdate("addItemPosition", v)}
        />
      </Field>
      <p className="text-xs text-muted">
        {t("settings.lists.addItemPositionHint")}
      </p>
    </Section>
  );
}
