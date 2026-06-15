import { useCallback, useMemo, useState } from "react";

import { useDevSeed } from "../dev/useDevSeed.ts";
import { useSettings } from "../settings/useSettings.ts";
import { BrowserLocalStorageAdapter } from "../storage/local/index.ts";
import { createDevSeedAdapter } from "../storage/dev-seed/index.ts";
import { useTheme } from "../theme/useTheme.ts";
import { ChangelogModal } from "../ui/changelog/ChangelogModal.tsx";
import { ChecklistView } from "../ui/ChecklistView.tsx";
import { PullToRefreshIndicator } from "../ui/PullToRefreshIndicator.tsx";
import { usePullToRefresh } from "../ui/hooks/usePullToRefresh.ts";
import { useViewportHeight } from "../ui/hooks/useViewportHeight.ts";
import { SettingsModal } from "../ui/settings/SettingsModal.tsx";
import { useChecklist } from "./use-checklist.ts";

// Thin root, in the spirit of budget's `App.tsx`: wire the cross-cutting
// hooks and hand state down to the view. Appearance settings apply
// immediately through `useTheme`; the header menu opens the settings and
// changelog modals. When the developer "Fake data" toggle is on, the
// localStorage backend is swapped for an ephemeral in-memory seed adapter
// so `useChecklist` reloads a sample document without touching the user's
// real data.

export function App() {
  const { settings, update } = useSettings();
  useTheme(settings);
  useViewportHeight();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  // Stable so `memo(ChecklistView)` can skip the whole list when only the
  // appearance settings (which share this component) change.
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const openChangelog = useCallback(() => setChangelogOpen(true), []);

  // Stable localStorage backend; a fresh seed adapter whenever fake data
  // is toggled on (so each enable starts from a pristine sample).
  const { active: fakeData } = useDevSeed();
  const localAdapter = useMemo(() => new BrowserLocalStorageAdapter(), []);
  const seedAdapter = useMemo(
    () => (fakeData ? createDevSeedAdapter() : null),
    [fakeData],
  );
  const checklist = useChecklist(seedAdapter ?? localAdapter);

  // Pull-to-refresh: a downward drag from the top of the list re-reads the
  // active backend (see `useChecklist.reload`). Gated off while a modal
  // owns the screen — the hook also bails on its own when an
  // `[aria-modal="true"]` element is mounted, but disabling here keeps the
  // document listeners off entirely while a dialog is up.
  const ptr = usePullToRefresh(checklist.reload, {
    enabled: !settingsOpen && !changelogOpen,
  });

  return (
    <>
      <PullToRefreshIndicator
        state={ptr.state}
        pullDistance={ptr.pullDistance}
      />
      <ChecklistView
        items={checklist.items}
        checkedCount={checklist.checkedCount}
        onAdd={checklist.addItem}
        onToggle={checklist.toggle}
        onRemove={checklist.remove}
        onArchive={checklist.archive}
        onReorder={checklist.reorder}
        onOpenSettings={openSettings}
        onOpenChangelog={openChangelog}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={update}
      />
      <ChangelogModal
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
      />
    </>
  );
}
