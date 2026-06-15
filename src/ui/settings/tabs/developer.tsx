import { useDevMode } from "../../../dev/useDevMode.ts";
import { useDevSeed } from "../../../dev/useDevSeed.ts";
import { useT } from "../../../i18n";
import { Section, ToggleRow } from "../shared.tsx";

// Developer-only controls, shown when developer mode is on. Capture logs
// persists the in-app logger to localStorage so the Logs tab survives a
// reload; fake data swaps in an ephemeral in-memory backend preloaded
// with a sample document.
export function DeveloperTab() {
  const t = useT();
  const { captureLogs, setCaptureLogs } = useDevMode();
  const { active: fakeData, setActive: setFakeData } = useDevSeed();
  return (
    <Section title={t("settings.developer.title")}>
      <p className="text-xs text-muted">{t("settings.developer.blurb")}</p>
      <ToggleRow
        label={t("settings.developer.captureLogs")}
        hint={t("settings.developer.captureLogsHint")}
        checked={captureLogs}
        onChange={setCaptureLogs}
      />
      <ToggleRow
        label={t("settings.developer.fakeData")}
        hint={t("settings.developer.fakeDataHint")}
        checked={fakeData}
        onChange={setFakeData}
      />
    </Section>
  );
}
