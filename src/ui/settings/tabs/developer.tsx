import { useDevMode } from "../../../dev/useDevMode.ts";
import { useDevSeed } from "../../../dev/useDevSeed.ts";
import { Section, ToggleRow } from "../shared.tsx";

// Developer-only controls, shown when developer mode is on. Capture logs
// persists the in-app logger to localStorage so the Logs tab survives a
// reload; fake data swaps in an ephemeral in-memory backend preloaded
// with a sample document.
export function DeveloperTab() {
  const { captureLogs, setCaptureLogs } = useDevMode();
  const { active: fakeData, setActive: setFakeData } = useDevSeed();
  return (
    <Section title="Developer">
      <p className="text-xs text-muted">
        Diagnostics for development. These settings stay on this device and
        never travel with a shared list.
      </p>
      <ToggleRow
        label="Capture logs"
        hint="Record the in-app log to this browser so it survives a reload. View it on the Logs tab."
        checked={captureLogs}
        onChange={setCaptureLogs}
      />
      <ToggleRow
        label="Fake data"
        hint="Replace your data with an in-memory sample document for this session. Reload (or turn off) to return to your real lists — the sample is never saved."
        checked={fakeData}
        onChange={setFakeData}
      />
    </Section>
  );
}
