import { useCallback, useEffect, useMemo, useState } from "react";

import { unlock, useAchievementWatcher } from "../achievements/index.ts";
import { useDevSeed } from "../dev/useDevSeed.ts";
import { useT, type MessageKey } from "../i18n";
import { LANGUAGE_EVENT } from "../i18n/language-preference.ts";
import { useStandaloneMobile } from "../pwa/standalone.ts";
import { useSettings } from "../settings/useSettings.ts";
import { createDevSeedAdapter } from "../storage/dev-seed/index.ts";
import type { NamespaceAppearance } from "../storage/namespaces.ts";
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
import { applyFaviconHref, namespaceLogoSrc } from "../ui/namespace-favicon.ts";
import { useEdgeSwipeOpen } from "../ui/hooks/useEdgeSwipeOpen.ts";
import { useMediaQuery } from "../ui/hooks/useMediaQuery.ts";
import { usePullToRefresh } from "../ui/hooks/usePullToRefresh.ts";
import { useUndoRedoShortcuts } from "../ui/hooks/useUndoRedoShortcuts.ts";
import { useViewportHeight } from "../ui/hooks/useViewportHeight.ts";
import { ModalBusProvider } from "../ui/ModalBusProvider.tsx";
import { useAnyModalOpen, useModalDispatch } from "../ui/modal-bus.ts";
import { AchievementsContext } from "../ui/achievements/achievements-context.ts";
import { useToast } from "../ui/toast/useToast.ts";
import type { Notify } from "./notify.ts";
import { AchievementsModalHost } from "./modals/AchievementsModalHost.tsx";
import { AchievementsUnlockModalHost } from "./modals/AchievementsUnlockModalHost.tsx";
import { ChangelogModalHost } from "./modals/ChangelogModalHost.tsx";
import { NamespacesModalHost } from "./modals/NamespacesModalHost.tsx";
import { SettingsModalHost } from "./modals/SettingsModalHost.tsx";
import { SyncDetailsModalHost } from "./modals/SyncDetailsModalHost.tsx";
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
  // The active backend (this device / Dropbox / Google Drive). Wired before
  // settings because it provides the root settings store the appearance
  // settings reconcile against (`settings.json` at the app-folder root).
  const storage = useStorageBackend();
  const { settings, update, unlockAchievements, clearUnseenAchievements } =
    useSettings(storage.settingsStore);
  useTheme(settings);
  useViewportHeight();

  const t = useT();
  const { push } = useToast();
  // The toast sink the checklist hooks raise their action confirmations
  // through. Stable so the edit verbs that depend on it keep their
  // identity across renders (memoised rows only re-render on a real edit).
  const notify = useCallback<Notify>(
    (message, kind = "info") => {
      push({ message, kind });
    },
    [push],
  );

  const dispatch = useModalDispatch();
  const anyModalOpen = useAnyModalOpen();

  // The left navigation drawer and which top-level view it has selected.
  const [menuOpen, setMenuOpen] = useState(false);
  // True while the floating menu button is being dragged to a new edge.
  const [menuButtonDragging, setMenuButtonDragging] = useState(false);
  const [view, setView] = useState<View>("checklist");
  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);

  // The floating menu button can only be hidden in the installed PWA on a
  // phone / tablet — there the inward edge swipe that replaces it has a free
  // edge to live on. Everywhere else the button always shows, whatever the
  // persisted flag says (it's shared per-origin with the PWA).
  const standaloneMobile = useStandaloneMobile();
  const showMenuButton = !standaloneMobile || settings.showMenuButton;

  // From the smallest iPad up (768px — iPad Mini portrait), the side menu is
  // pinned open as a permanent docked sidebar rather than a drawer. Below
  // that the floating-button drawer carries the navigation as before.
  const pinned = useMediaQuery("(min-width: 768px)");
  const navigate = useCallback((next: View) => {
    setView(next);
    setMenuOpen(false);
  }, []);

  // Stable so `memo(ChecklistView)` can skip the whole list when only the
  // appearance settings (which share this component) change.
  // The header cloud glyph opens the sync-details modal (not storage
  // settings) so a failed save surfaces *what* and *why* it broke. Opening
  // it is the `syncSleuth` unlock — the user looked under the cloud's hood.
  const openSyncDetails = useCallback(() => {
    unlock("syncSleuth");
    dispatch({ kind: "sync-details" });
  }, [dispatch]);

  // A fresh seed adapter whenever fake data is toggled on (so each enable
  // starts from a pristine sample) overrides the real backend for the
  // session.
  const { active: fakeData } = useDevSeed();
  const seedAdapter = useMemo(
    () => (fakeData ? createDevSeedAdapter() : null),
    [fakeData],
  );
  const checklist = useChecklist(
    seedAdapter ?? storage.adapter,
    settings.addItemPosition,
    notify,
  );

  // Achievements. The watcher records derived unlocks (first item, theme
  // change, …) off every document / settings transition and drains the
  // manual-unlock bus (cloud connect, copy, undo, …); a fresh unlock raises
  // a celebratory toast and badges the header trophy via `AchievementsContext`.
  const onAchievementsUnlocked = useCallback(
    (ids: string[]) => {
      const message =
        ids.length === 1
          ? t("achievements.toast.unlockedOne", {
              name: t(`achievements.catalog.${ids[0]}.name` as MessageKey),
            })
          : t("achievements.toast.unlockedOther", { n: String(ids.length) });
      push({ message, kind: "success" });
    },
    [push, t],
  );
  useAchievementWatcher({
    snapshot: checklist.snapshot,
    settings,
    loaded: checklist.loaded,
    record: unlockAchievements,
    onUnlocked: onAchievementsUnlocked,
  });

  // `homeScreen`: fired once when the app is running as an installed PWA
  // (standalone display mode, or iOS's `navigator.standalone`). The bus
  // dedupes, so the every-mount fire only ever records the unlock once.
  useEffect(() => {
    const standalone =
      (typeof window !== "undefined" &&
        window.matchMedia?.("(display-mode: standalone)").matches === true) ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) unlock("homeScreen");
  }, []);

  // `polyglot`: fired when the active language changes (the picker dispatches
  // `LANGUAGE_EVENT`; language preference lives outside `Settings`, so this
  // can't be a derived trigger).
  useEffect(() => {
    const onLang = () => unlock("polyglot");
    window.addEventListener(LANGUAGE_EVENT, onLang);
    return () => window.removeEventListener(LANGUAGE_EVENT, onLang);
  }, []);

  // `freshPull`: a pull-to-refresh re-reads the backend. Wrap the reload so
  // the gesture records the unlock; the underlying `reload` is unchanged.
  const { reload } = checklist;
  const refresh = useCallback(() => {
    unlock("freshPull");
    return reload();
  }, [reload]);

  // Namespace create / delete live in the storage layer (which must not
  // reach into the UI), so the toast is raised here where both the
  // storage verbs and the toast stack are in scope. The wrapped verbs are
  // what the side menu and the namespaces dialog call.
  const { createNamespace: createNs, removeNamespace: removeNs } = storage;
  const namespaces = storage.namespaces;
  const createNamespace = useCallback(
    (name: string, appearance?: NamespaceAppearance) => {
      createNs(name, appearance);
      push({
        message: t("toast.namespaceCreated", { name: name.trim() }),
        kind: "success",
      });
    },
    [createNs, push, t],
  );
  const removeNamespace = useCallback(
    async (slug: string) => {
      const name = namespaces.find((n) => n.slug === slug)?.name ?? slug;
      await removeNs(slug);
      push({ message: t("toast.namespaceDeleted", { name }), kind: "info" });
    },
    [removeNs, namespaces, push, t],
  );

  // The active namespace's chosen glyph (if any) re-badges the app: it
  // stands in for the header wordmark logo and the browser-tab favicon.
  // Without a glyph, both fall back to the bundled checklist mark.
  const activeNamespaceEntry = useMemo(
    () => namespaces.find((n) => n.slug === storage.activeNamespace),
    [namespaces, storage.activeNamespace],
  );
  const logoSrc = useMemo(
    () => namespaceLogoSrc(activeNamespaceEntry),
    [activeNamespaceEntry],
  );
  useEffect(() => {
    applyFaviconHref(logoSrc);
  }, [logoSrc]);

  // The sync glyph shows for any async file-backed session (local folder,
  // Dropbox, Google Drive) so the user gets save status, a "save now"
  // affordance, and the conflict surface — not for the browser backend
  // (nothing to sync) nor while fake data overrides the adapter (the
  // status wouldn't reflect the user's actual backend).
  const cloudBacked =
    !fakeData &&
    (storage.backend === "folder" ||
      storage.backend === "dropbox" ||
      storage.backend === "gdrive");
  // Memoised so the published `ChecklistContext` value stays stable across
  // renders that don't touch the sync state (it is the stable `null` for a
  // local session, and only changes with the save status for a cloud one).
  // Re-issue OAuth for the active cloud backend — wired to the details
  // modal's "Reconnect" button when a session lapses. The folder backend
  // has no OAuth gesture (it reconnects from settings), so it's null.
  const { connectDropbox, connectGdrive } = storage;
  const onReconnect = useMemo<(() => Promise<void>) | null>(() => {
    if (storage.backend === "dropbox") {
      return async () => connectDropbox();
    }
    if (storage.backend === "gdrive") return connectGdrive;
    return null;
  }, [storage.backend, connectDropbox, connectGdrive]);

  const sync = useMemo<SyncInfo | null>(
    () =>
      cloudBacked
        ? {
            backend: storage.backend,
            namespace: storage.activeNamespace,
            providerName:
              storage.backend === "dropbox"
                ? "Dropbox"
                : storage.backend === "gdrive"
                  ? "Google Drive"
                  : "Local folder",
            status: checklist.status,
            statusDetail: checklist.statusDetail,
            dirty: checklist.dirty,
            onSave: checklist.saveNow,
            onOpenDetails: openSyncDetails,
            onReconnect,
          }
        : null,
    [
      cloudBacked,
      storage.backend,
      storage.activeNamespace,
      checklist.status,
      checklist.statusDetail,
      checklist.dirty,
      checklist.saveNow,
      openSyncDetails,
      onReconnect,
    ],
  );

  // Pull-to-refresh: a downward drag from the top of the list re-reads the
  // active backend (see `useChecklist.reload`). Gated off while a modal
  // owns the screen, and while the floating menu button is being dragged —
  // dragging it downward would otherwise arm a refresh at the same time.
  const ptr = usePullToRefresh(refresh, {
    enabled:
      !anyModalOpen && !menuOpen && !menuButtonDragging && view === "checklist",
  });

  // When the floating button is hidden, an inward swipe from the drawer's
  // resting edge opens it. Gated off while a modal or the drawer already
  // owns the screen.
  useEdgeSwipeOpen({
    side: settings.menuButtonPosition.side,
    enabled: !showMenuButton && !anyModalOpen && !menuOpen && !pinned,
    onOpen: openMenu,
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
    () => ({ ...checklist, sync, logoSrc }),
    [checklist, sync, logoSrc],
  );
  // Just the unseen count for the header trophy badge — kept off the
  // checklist context (whose stability lets the memoised list skip settings
  // re-renders) so an unlock badges the button without reconciling the list.
  const achievementsValue = useMemo(
    () => ({ unseenCount: settings.unseenAchievements.length }),
    [settings.unseenAchievements.length],
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
      showButton: showMenuButton,
      pinned,
    }),
    [
      menuOpen,
      view,
      toggleMenu,
      closeMenu,
      navigate,
      settings.menuButtonPosition,
      update,
      showMenuButton,
      pinned,
    ],
  );

  return (
    <NavContext.Provider value={navValue}>
      <ChecklistContext.Provider value={checklistValue}>
        <AchievementsContext.Provider value={achievementsValue}>
          <PullToRefreshIndicator
            state={ptr.state}
            pullDistance={ptr.pullDistance}
          />
          {/* A flex row so the pinned sidebar docks beside the content. When
            the menu isn't pinned, SideMenu renders only `position: fixed`
            layers (the floating button and the overlay drawer), which sit
            outside the flex flow — so the view keeps the full width. */}
          <div className="flex h-full">
            <SideMenu
              namespaces={storage.namespaces}
              activeNamespace={storage.activeNamespace}
              onSwitchNamespace={storage.switchNamespace}
              onRemoveNamespace={removeNamespace}
            />
            <main className="relative h-full min-w-0 flex-1">
              {view === "archive" ? <ArchiveView /> : <ChecklistView />}
            </main>
          </div>
          <SettingsModalHost
            settings={settings}
            onUpdate={update}
            storage={storage}
          />
          <ChangelogModalHost />
          <SyncDetailsModalHost />
          <NamespacesModalHost
            storage={storage}
            onCreate={createNamespace}
            onRemove={removeNamespace}
          />
          <AchievementsModalHost settings={settings} />
          <AchievementsUnlockModalHost
            settings={settings}
            onClear={clearUnseenAchievements}
          />
          <ConflictResolutionModal
            open={checklist.conflict !== null}
            local={checklist.snapshot}
            remote={checklist.conflict?.remote ?? checklist.snapshot}
            onResolve={(keep) => {
              unlock("peacemaker");
              checklist.resolveConflict(keep);
            }}
          />
          <UnlockGate open={storage.locked} onUnlock={storage.unlock} />
        </AchievementsContext.Provider>
      </ChecklistContext.Provider>
    </NavContext.Provider>
  );
}
