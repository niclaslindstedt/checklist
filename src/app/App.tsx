import { useCallback, useMemo, useState } from "react";

import { useDevSeed } from "../dev/useDevSeed.ts";
import { useSettings } from "../settings/useSettings.ts";
import { createDevSeedAdapter } from "../storage/dev-seed/index.ts";
import { useStorageBackend } from "../storage/useStorageBackend.ts";
import { useTheme } from "../theme/useTheme.ts";
import { ArchiveView } from "../ui/ArchiveView.tsx";
import { ChangelogModal } from "../ui/changelog/ChangelogModal.tsx";
import { ChecklistView, type SyncInfo } from "../ui/ChecklistView.tsx";
import { ConflictResolutionModal } from "../ui/ConflictResolutionModal.tsx";
import { PullToRefreshIndicator } from "../ui/PullToRefreshIndicator.tsx";
import { SideMenu, type View } from "../ui/SideMenu.tsx";
import { UnlockGate } from "../ui/UnlockGate.tsx";
import { usePullToRefresh } from "../ui/hooks/usePullToRefresh.ts";
import { useUndoRedoShortcuts } from "../ui/hooks/useUndoRedoShortcuts.ts";
import { useViewportHeight } from "../ui/hooks/useViewportHeight.ts";
import { SettingsModal } from "../ui/settings/SettingsModal.tsx";
import { useChecklist } from "./use-checklist.ts";

// Thin root, in the spirit of budget's `App.tsx`: wire the cross-cutting
// hooks and hand state down to the view. Appearance settings apply
// immediately through `useTheme`; the side menu opens the settings and
// changelog modals. When the developer "Fake data" toggle is on, the
// active backend is swapped for an ephemeral in-memory seed adapter so
// `useChecklist` reloads a sample document without touching real data.

export function App() {
  const { settings, update } = useSettings();
  useTheme(settings);
  useViewportHeight();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"storage" | undefined>(
    undefined,
  );
  const [changelogOpen, setChangelogOpen] = useState(false);

  // The left navigation drawer and which top-level view it has selected.
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<View>("checklist");
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const navigate = useCallback((next: View) => {
    setView(next);
    setMenuOpen(false);
  }, []);

  // Stable so `memo(ChecklistView)` can skip the whole list when only the
  // appearance settings (which share this component) change.
  const openSettings = useCallback(() => {
    setSettingsTab(undefined);
    setSettingsOpen(true);
  }, []);
  const openStorageSettings = useCallback(() => {
    setSettingsTab("storage");
    setSettingsOpen(true);
  }, []);
  const openChangelog = useCallback(() => setChangelogOpen(true), []);

  // The active backend (this device / Dropbox / Google Drive), optionally
  // wrapped with at-rest encryption. A fresh seed adapter whenever fake
  // data is toggled on (so each enable starts from a pristine sample)
  // overrides it for the session.
  const storage = useStorageBackend();
  const { active: fakeData } = useDevSeed();
  const seedAdapter = useMemo(
    () => (fakeData ? createDevSeedAdapter() : null),
    [fakeData],
  );
  const checklist = useChecklist(
    seedAdapter ?? storage.adapter,
    settings.addItemPosition,
  );

  // The cloud-sync glyph only shows for a real cloud-backed session — not
  // for the local backend (nothing to sync) nor while fake data overrides
  // the adapter (the status wouldn't reflect the user's actual backend).
  const cloudBacked =
    !fakeData &&
    (storage.backend === "dropbox" || storage.backend === "gdrive");
  const sync: SyncInfo | null = cloudBacked
    ? {
        providerName:
          storage.backend === "dropbox" ? "Dropbox" : "Google Drive",
        status: checklist.status,
        dirty: checklist.dirty,
        onSave: checklist.saveNow,
        onOpenDetails: openStorageSettings,
      }
    : null;

  // Pull-to-refresh: a downward drag from the top of the list re-reads the
  // active backend (see `useChecklist.reload`). Gated off while a modal
  // owns the screen.
  const ptr = usePullToRefresh(checklist.reload, {
    enabled:
      !settingsOpen && !changelogOpen && !menuOpen && view === "checklist",
  });

  // Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z mirror the burger-menu undo & redo.
  useUndoRedoShortcuts({
    canUndo: checklist.canUndo,
    canRedo: checklist.canRedo,
    onUndo: checklist.undo,
    onRedo: checklist.redo,
  });

  return (
    <>
      <PullToRefreshIndicator
        state={ptr.state}
        pullDistance={ptr.pullDistance}
      />
      {view === "archive" ? (
        <ArchiveView
          items={checklist.archivedItems}
          onRestore={checklist.unarchive}
          onRemove={checklist.remove}
        />
      ) : (
        <ChecklistView
          items={checklist.items}
          checkedCount={checklist.checkedCount}
          onAdd={checklist.addItem}
          onToggle={checklist.toggle}
          onRemove={checklist.remove}
          onArchive={checklist.archive}
          onReorder={checklist.reorder}
          sync={sync}
        />
      )}
      <SideMenu
        open={menuOpen}
        onToggle={toggleMenu}
        onClose={closeMenu}
        current={view}
        onNavigate={navigate}
        archivedCount={checklist.archivedItems.length}
        onUndo={checklist.undo}
        onRedo={checklist.redo}
        canUndo={checklist.canUndo}
        canRedo={checklist.canRedo}
        onOpenSettings={openSettings}
        onOpenChangelog={openChangelog}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={update}
        storage={storage}
        initialTab={settingsTab}
      />
      <ChangelogModal
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
      />
      <ConflictResolutionModal
        open={checklist.conflict !== null}
        local={checklist.snapshot}
        remote={checklist.conflict?.remote ?? checklist.snapshot}
        onResolve={checklist.resolveConflict}
      />
      <UnlockGate open={storage.locked} onUnlock={storage.unlock} />
    </>
  );
}
