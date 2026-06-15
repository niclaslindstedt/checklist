import { useDevMode } from "../../../dev/useDevMode.ts";
import { Section, ToggleRow } from "../shared.tsx";

// The landing tab. Holds the developer-mode switch, which reveals the
// Developer and Logs tabs when on.
export function GeneralTab() {
  const { devMode, setDevMode } = useDevMode();
  return (
    <Section title="General">
      <p className="text-xs text-muted">
        checklist is a local-first app — your lists live in this browser.
        Appearance settings are saved on this device.
      </p>
      <ToggleRow
        label="Developer mode"
        hint="Reveal the Developer and Logs tabs for capturing diagnostics and loading sample data."
        checked={devMode}
        onChange={setDevMode}
      />
    </Section>
  );
}
