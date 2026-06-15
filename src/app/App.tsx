import { useMemo, useState } from "react";

import { useDevSeed } from "../dev/useDevSeed.ts";
import { useSettings } from "../settings/useSettings.ts";
import { BrowserLocalStorageAdapter } from "../storage/local/index.ts";
import { createDevSeedAdapter } from "../storage/dev-seed/index.ts";
import { useTheme } from "../theme/useTheme.ts";
import { ChecklistView } from "../ui/ChecklistView.tsx";
import { SettingsModal } from "../ui/settings/SettingsModal.tsx";
import { useChecklist } from "./use-checklist.ts";

// Thin root, in the spirit of budget's `App.tsx`: wire the cross-cutting
// hooks and hand state down to the view. Appearance settings apply
// immediately through `useTheme`; the settings cogwheel opens the modal.
// When the developer "Fake data" toggle is on, the localStorage backend
// is swapped for an ephemeral in-memory seed adapter so `useChecklist`
// reloads a sample document without touching the user's real data.

export function App() {
  const { settings, update, reset } = useSettings();
  useTheme(settings);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Stable localStorage backend; a fresh seed adapter whenever fake data
  // is toggled on (so each enable starts from a pristine sample).
  const { active: fakeData } = useDevSeed();
  const localAdapter = useMemo(() => new BrowserLocalStorageAdapter(), []);
  const seedAdapter = useMemo(
    () => (fakeData ? createDevSeedAdapter() : null),
    [fakeData],
  );
  const checklist = useChecklist(seedAdapter ?? localAdapter);

  return (
    <>
      <ChecklistView
        items={checklist.items}
        checkedCount={checklist.checkedCount}
        onAdd={checklist.addItem}
        onToggle={checklist.toggle}
        onRemove={checklist.remove}
        onArchive={checklist.archive}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={update}
        onReset={reset}
      />
    </>
  );
}
