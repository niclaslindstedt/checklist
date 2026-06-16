import { useCallback, useMemo, useState } from "react";

import { useDevSeed } from "../dev/useDevSeed.ts";
import { useSettings } from "../settings/useSettings.ts";
import { createDevSeedAdapter } from "../storage/dev-seed/index.ts";
import { useStorageBackend } from "../storage/useStorageBackend.ts";
import { useTheme } from "../theme/useTheme.ts";
import { ArchiveView } from "../ui/ArchiveView.tsx";
import { ChecklistView } from "../ui/ChecklistView.tsx";
import {
  ChecklistContext,
  type ChecklistContextValue,
  type SyncInfo,
} from "../ui/checklist-context.ts";
import { ConflictResolutionModal } from "../ui/ConflictResolutionModal.tsx";
import {
  NavContext,
  type NavContextValue,
  type View,
} from "../ui/nav-context.ts";
import { PullToRefreshIndicator } from "../ui/PullToRefreshIndicator.tsx";
import { SideMenu } from "../ui/SideMenu.tsx";
import { UnlockGate } from "../ui/UnlockGate.tsx";
import { usePullToRefresh } from "../ui/hooks/usePullToRefresh.ts";
import { useUndoRedoShortcuts } from "../ui/hooks/useUndoRedoShortcuts.ts";
import { useViewportHeight } from "../ui/hooks/useViewportHeight.ts";
import { ModalBusProvider } from "../ui/ModalBusProvider.tsx";
import { useAnyModalOpen, useModalDispatch } from "../ui/modal-bus.ts";
import { ChangelogModalHost } from "./modals/ChangelogModalHost.tsx";
import { NamespacesModalHost } from "./modals/NamespacesModalHost.tsx";
import { SettingsModalHost } from "./modals/SettingsModalHost.tsx";
import { useChecklist } from "./use-checklist.ts";

// Thin root, in the spirit of budget's `App.tsx`: wire the cross-cutting
// hooks and publish their state through two focused contexts instead of
// threading props down. `ChecklistContext` carries the `useChecklist`
// surface (plus the derived cloud-sync info) and `NavContext` the drawer /
// view state; the views and `SideMenu` read what they need rather than
// taking it as props. The modal bus owns each dialog's open/close state
// (see `modal-bus.tsx`); buttons `dispatch` a command and a host opens the
// matching modal, so the shell carries no per-modal state. Appearance
// settings apply immediately through `useTheme`. When the developer "Fake
// data" toggle is on, the active backend is swapped for an ephemeral
// in-memory seed adapter so `useChecklist` reloads a sample document
// without touching real data.

export function App() {
  return (
    <ModalBusProvider>
      <AppShell />
    </ModalBusProvider>
  );
}

function AppShell() {
  const { settings, update } = useSettings();
  useTheme(settings);
  useViewportHeight();

  const dispatch = useModalDispatch();
  const anyModalOpen = useAnyModalOpen();

  // The left navigation drawer and which top-level view it has selected.
  const [menuOpen, setMenuOpen] = useState(false);
  // True while the floating menu button is being dragged to a new edge.
  const [menuButtonDragging, setMenuButtonDragging] = useState(false);
  const [view, setView] = useState<View>("checklist");
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const navigate = useCallback((next: View) => {
    setView(next);
    setMenuOpen(false);
  }, []);

  // Stable so `memo(ChecklistView)` can skip the whole list when only the
  // appearance settings (which share this component) change.
  const openStorageSettings = useCallback(
    () => dispatch({ kind: "settings", tab: "storage" }),
    [dispatch],
  );

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
  // Memoised so the published `ChecklistContext` value stays stable across
  // renders that don't touch the sync state (it is the stable `null` for a
  // local session, and only changes with the save status for a cloud one).
  const sync = useMemo<SyncInfo | null>(
    () =>
      cloudBacked
        ? {
            providerName:
              storage.backend === "dropbox" ? "Dropbox" : "Google Drive",
            status: checklist.status,
            dirty: checklist.dirty,
            onSave: checklist.saveNow,
            onOpenDetails: openStorageSettings,
          }
        : null,
    [
      cloudBacked,
      storage.backend,
      checklist.status,
      checklist.dirty,
      checklist.saveNow,
      openStorageSettings,
    ],
  );

  // Pull-to-refresh: a downward drag from the top of the list re-reads the
  // active backend (see `useChecklist.reload`). Gated off while a modal
  // owns the screen, and while the floating menu button is being dragged —
  // dragging it downward would otherwise arm a refresh at the same time.
  const ptr = usePullToRefresh(checklist.reload, {
    enabled:
      !anyModalOpen &&
      !menuOpen &&
      !menuButtonDragging &&
      view === "checklist",
  });

  // Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z mirror the burger-menu undo & redo.
  useUndoRedoShortcuts({
    canUndo: checklist.canUndo,
    canRedo: checklist.canRedo,
    onUndo: checklist.undo,
    onRedo: checklist.redo,
  });

  // The values published to the views / SideMenu. Both are memoised so a
  // settings-only re-render (a colour-swatch drag fires continuously) keeps
  // a stable identity — `checklist` is already memoised in `useChecklist`,
  // and `sync` is the stable `null` for a local session — so the memoised
  // `ChecklistView` / `ArchiveView` skip re-rendering on those.
  const checklistValue = useMemo<ChecklistContextValue>(
    () => ({ ...checklist, sync }),
    [checklist, sync],
  );
  const navValue = useMemo<NavContextValue>(
    () => ({
      open: menuOpen,
      current: view,
      toggle: toggleMenu,
      close: closeMenu,
      navigate,
      setDragging: setMenuButtonDragging,
      position: settings.menuButtonPosition,
      setPosition: (next) => update("menuButtonPosition", next),
    }),
    [
      menuOpen,
      view,
      toggleMenu,
      closeMenu,
      navigate,
      settings.menuButtonPosition,
      update,
    ],
  );

  return (
    <NavContext.Provider value={navValue}>
      <ChecklistContext.Provider value={checklistValue}>
        <PullToRefreshIndicator
          state={ptr.state}
          pullDistance={ptr.pullDistance}
        />
        {view === "archive" ? <ArchiveView /> : <ChecklistView />}
        <SideMenu
          namespaces={storage.namespaces}
          activeNamespace={storage.activeNamespace}
          onSwitchNamespace={storage.switchNamespace}
        />
        <SettingsModalHost
          settings={settings}
          onUpdate={update}
          storage={storage}
        />
        <ChangelogModalHost />
        <NamespacesModalHost storage={storage} />
        <ConflictResolutionModal
          open={checklist.conflict !== null}
          local={checklist.snapshot}
          remote={checklist.conflict?.remote ?? checklist.snapshot}
          onResolve={checklist.resolveConflict}
        />
        <UnlockGate open={storage.locked} onUnlock={storage.unlock} />
      </ChecklistContext.Provider>
    </NavContext.Provider>
  );
}
