// Top-level storage wiring, as a hook. Selects the active
// `StorageAdapter` from the per-device backend preference, holds the
// cloud access tokens, completes the OAuth redirect on boot, and layers
// optional at-rest encryption on top. The checklist counterpart of the
// budget project's `useStorageBackend` / `boot-auth` pair, collapsed to
// fit an account-less, single-document app.
//
// Encryption note: there are no user accounts, so the encryption
// passphrase isn't derived from a login — it's set explicitly in
// Settings and held only in memory for the session. After a reload the
// app is "locked" (encryption is on but no passphrase is held) until the
// user re-enters it; the `locked` flag drives the unlock gate in `App`.

import { useCallback, useMemo, useRef, useState } from "react";

// Aliased: this hook already exposes an encryption `unlock` verb, so the
// achievement bus's `unlock` comes in under a distinct name.
import { unlock as unlockAchievement } from "../achievements/bus.ts";
import { createLogger } from "../dev/logger.ts";
import { addFolder, setChecklistFolder } from "../domain/folders.ts";
import type { Checklist, Folder } from "../domain/types.ts";
import type { StorageAdapter, StoredSnapshot } from "./adapter.ts";
import {
  type BackendId,
  type EncryptionMode,
  getBackend,
  setBackend as persistBackend,
} from "./backend-preference.ts";
import {
  type BackendSelection,
  createBackendFactory,
  wrapForEncryption,
} from "./backend-factory.ts";
import {
  deleteDropboxNamespace,
  isDropboxConfigured,
} from "./dropbox/index.ts";
import { deleteGdriveNamespace, isGdriveConfigured } from "./gdrive/index.ts";
import { deleteLocalNamespace } from "./local/index.ts";
import { writeMovedDocument } from "./namespace-moves.ts";
import type { SettingsStore } from "./settings-store.ts";
import { isFolderBackendAvailable } from "./folder/handle-store.ts";
import {
  DEFAULT_NAMESPACE_SLUG,
  type Namespace,
  type NamespaceAppearance,
  getActiveNamespaceSlug,
  setActiveNamespaceSlug,
} from "./namespaces.ts";
import { useNamespaceRegistry } from "./useNamespaceRegistry.ts";
import {
  type EncryptionProgress,
  type EncryptionProgressStep,
  useEncryption,
} from "./useEncryption.ts";
import { type FolderRuntime, useFolderHandle } from "./useFolderHandle.ts";
import { useCloudTokens } from "./useCloudTokens.ts";

// Re-exported from their new home in `useEncryption.ts` so existing importers
// (the unlock gate, the storage settings tab, the progress-message map, and
// their tests) keep resolving these types from this hook's module.
export type { EncryptionProgress, EncryptionProgressStep };

const log = createLogger("storage");

export interface UseStorageBackend {
  /** The adapter to hand to `useChecklist`. A no-op placeholder while locked. */
  adapter: StorageAdapter;
  /**
   * The active backend's root settings store — `settings.json` at the
   * app-folder root, shared by every namespace and stored as plaintext JSON
   * even when the document is encrypted. Null for the browser backend
   * (which keeps settings in localStorage) and while a folder grant is
   * unresolved; `useSettings` reconciles against it when present.
   */
  settingsStore: SettingsStore | null;
  /** Which backend is selected. */
  backend: BackendId;
  /** Whether each cloud backend's app key / client id is built in. */
  dropboxConfigured: boolean;
  gdriveConfigured: boolean;
  /** Whether each cloud backend currently holds a usable token. */
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  /** Whether this browser exposes the File System Access directory picker. */
  folderAvailable: boolean;
  /** Whether a picked folder is connected and usable right now. */
  folderConnected: boolean;
  /**
   * Set when the stored folder grant needs re-confirming (the OS revoked
   * it between sessions). The folder backend falls back to the browser
   * store until the user clicks Reconnect.
   */
  folderReconnectNeeded: boolean;
  /** Encryption mode and whether a passphrase is held this session. */
  encryption: EncryptionMode;
  /** True when encryption is on but no passphrase is held yet (needs unlock). */
  locked: boolean;
  selectBrowser: () => void;
  /** Pick a folder, seed it from the current document, and switch to it. */
  connectFolder: () => Promise<void>;
  /** Re-confirm the OS grant on the already-picked folder. */
  reconnectFolder: () => Promise<void>;
  /** Mirror the folder back into the browser store, then forget the folder. */
  disconnectFolder: () => Promise<void>;
  connectDropbox: () => void;
  disconnectDropbox: () => void;
  connectGdrive: () => Promise<void>;
  disconnectGdrive: () => void;
  /**
   * Turn encryption on with a fresh passphrase, re-wrapping stored bytes.
   * `onProgress` (optional) fires once per phase so the UI can show progress.
   */
  enableEncryption: (
    password: string,
    onProgress?: EncryptionProgress,
  ) => Promise<void>;
  /**
   * Turn encryption off, decrypting stored bytes back to plaintext.
   * `onProgress` (optional) fires once per phase so the UI can show progress.
   */
  disableEncryption: (onProgress?: EncryptionProgress) => Promise<void>;
  /**
   * Supply the passphrase for an already-encrypted store; throws if wrong.
   * `onProgress` (optional) fires once per phase so the unlock gate can flash a
   * status line while the passphrase is checked and the document decrypts.
   */
  unlock: (password: string, onProgress?: EncryptionProgress) => Promise<void>;
  /** Namespaces known on this device (default always first). */
  namespaces: Namespace[];
  /** The active namespace's slug. */
  activeNamespace: string;
  /** Make a namespace active, swapping which document the app reads/writes. */
  switchNamespace: (slug: string) => void;
  /**
   * Write a checklist into another namespace's document, returning whether the
   * target write succeeded. Best-effort: a failed write (offline, locked)
   * resolves `false` and leaves the source untouched, so the caller only drops
   * its local copy on success. The list's folder link is dropped — the target
   * namespace has its own folders.
   */
  moveChecklistToNamespace: (
    checklist: Checklist,
    targetSlug: string,
  ) => Promise<boolean>;
  /**
   * Write a whole folder — and every checklist filed inside it — into another
   * namespace's document, returning whether the target write succeeded. Like
   * {@link moveChecklistToNamespace} it's best-effort: a failed write resolves
   * `false` and leaves the source untouched, so the caller only drops its local
   * copy on success. The lists keep their `folderId` and the folder is added to
   * the target's registry, so the group survives the move intact.
   */
  moveFolderToNamespace: (
    folder: Folder,
    checklists: Checklist[],
    targetSlug: string,
  ) => Promise<boolean>;
  /** Create a namespace from a display name and switch to it. */
  createNamespace: (name: string, appearance?: NamespaceAppearance) => void;
  /** Change a namespace's display name (its data stays put). */
  renameNamespace: (slug: string, name: string) => void;
  /**
   * Set or clear a namespace's appearance (its icon and/or accent colour).
   * Applied live as the user picks; the data and slug stay put.
   */
  setNamespaceAppearance: (slug: string, patch: NamespaceAppearance) => void;
  /**
   * Remove a namespace and delete its data in the *active* backend. The
   * default namespace can't be removed. Orphaned copies in other backends
   * (or on other devices) are left untouched.
   */
  removeNamespace: (slug: string) => Promise<void>;
}

// Placeholder used while the store is locked: never touches the real
// backend, so the encrypted bytes stay sealed and an accidental edit
// behind the unlock gate can't overwrite them. Resolves saves to a
// no-op rather than rejecting so no stray promise rejection surfaces.
function lockedAdapter(id: BackendId): StorageAdapter {
  return {
    id,
    label: "Locked",
    capabilities: new Set(),
    async load(): Promise<StoredSnapshot | null> {
      return null;
    },
    async save(text: string): Promise<StoredSnapshot> {
      log.warn("save ignored — store is locked");
      return { text };
    },
  };
}

export function useStorageBackend(): UseStorageBackend {
  const [backend, setBackendState] = useState<BackendId>(getBackend);
  const [activeNamespace, setActiveNamespaceState] = useState<string>(
    getActiveNamespaceSlug,
  );

  // The shared persist → select pair every backend switch ends on: persist
  // the choice and flip the in-memory selection. Each backend's connect /
  // disconnect path does its own token / handle setup, routes through here,
  // and (on connect) raises its own `unlockAchievement` — kept inline at the
  // call site so the catalog test can statically see every manual unlock.
  // Adding a fourth backend is one call, not a re-typed `persistBackend` +
  // `setBackendState` pair.
  const switchToBackend = useCallback((id: BackendId) => {
    persistBackend(id);
    setBackendState(id);
  }, []);

  // The local-folder (File System Access) lifecycle: owns the picked handle,
  // its boot probe and revoked-grant state, and the connect / reconnect /
  // disconnect verbs. The verbs read the active document to seed / mirror, so
  // they reach `adapter` / `wrapForActive` (built downstream of the handle)
  // through `folderRuntime`, a latest-ref the parent refreshes each render.
  const folderRuntime = useRef<FolderRuntime>({
    activeNamespace,
    adapter: lockedAdapter(backend),
    wrapForActive: (raw) => raw,
  });
  const {
    folderHandle,
    folderHandleLoaded,
    folderReconnectNeeded,
    markFolderPermissionLost,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
  } = useFolderHandle(switchToBackend, folderRuntime);

  // The cloud-credential lifecycle: owns the Dropbox access / refresh tokens
  // and the Google Drive access token, completes the Dropbox OAuth redirect on
  // boot, and carries both backends' connect / disconnect verbs. The selection
  // memo reads the three tokens (and the Dropbox access-token refresh hook);
  // the connect verbs route through `switchToBackend`.
  const {
    dropboxToken,
    dropboxRefresh,
    gdriveToken,
    onDropboxAccessTokenRefreshed,
    connectDropbox,
    disconnectDropbox,
    connectGdrive,
    disconnectGdrive,
  } = useCloudTokens(switchToBackend);

  // Resolve the active backend once. Both builders below switch on this
  // single selection rather than re-deriving the `backend && token` chain.
  // Keyed independent of `activeNamespace` so a namespace switch rebuilds
  // only the document adapter, not the namespace-agnostic settings store.
  const selection = useMemo<BackendSelection>(() => {
    if (backend === "dropbox" && dropboxToken) {
      return {
        kind: "dropbox",
        auth: {
          accessToken: dropboxToken,
          refreshToken: dropboxRefresh,
          onAccessTokenRefreshed: onDropboxAccessTokenRefreshed,
        },
      };
    }
    if (backend === "gdrive" && gdriveToken) {
      return { kind: "gdrive", token: gdriveToken };
    }
    // Folder backend: only once the boot probe has resolved with a live,
    // permission-granted handle. While probing, or after a revoked grant,
    // fall through to the browser store so editing keeps working.
    if (backend === "folder" && folderHandleLoaded && folderHandle) {
      return { kind: "folder", handle: folderHandle };
    }
    return { kind: "browser" };
  }, [
    backend,
    dropboxToken,
    dropboxRefresh,
    gdriveToken,
    onDropboxAccessTokenRefreshed,
    folderHandle,
    folderHandleLoaded,
  ]);

  // One place that knows how to build every per-backend store from the active
  // selection — the namespace-scoped document adapter (`makeInner`), the root
  // settings store, and the root namespace registry store. Rebuilt only when
  // the selection (or the folder permission callback) changes, so a namespace
  // switch reuses it and rebuilds just the document adapter below. Adding a
  // backend is one new case in `createBackendFactory`, not three switches kept
  // in lockstep here.
  const factory = useMemo(
    () =>
      createBackendFactory(selection, {
        fetchImpl: fetch,
        storage: globalThis.localStorage,
        onFolderPermissionLost: markFolderPermissionLost,
      }),
    [selection, markFolderPermissionLost],
  );

  // The unwrapped, namespace-scoped backend builder. Held as its own binding so
  // a cross-namespace move can spin up an adapter pointed at the *target*
  // namespace's document (`makeInner(targetSlug)`) without switching the active
  // one. Stable per `factory`, so the move callbacks that depend on it only
  // rebuild when the selection changes.
  const makeInner = factory.makeInner;

  // The active namespace's scoped backend — the document the app reads/writes.
  const inner = useMemo<StorageAdapter>(
    () => makeInner(activeNamespace),
    [makeInner, activeNamespace],
  );

  // The active backend's root settings store (rooted at the app folder, no
  // namespace, app-wide plaintext) and namespace registry (`namespaces.json`
  // beside `settings.json`, so the namespace list travels with the synced /
  // shared folder). Both null for the browser backend (localStorage is their
  // only home) and while a folder grant is unresolved.
  const settingsStore = factory.settingsStore;
  const namespaceStore = factory.namespaceStore;

  // The device namespace registry: owns the `namespaces` state, mirrors each
  // mutation into the active backend's `namespaces.json`, and reconciles with
  // the backend's list when a file backend is (re)selected. The CRUD verbs
  // below wrap these with the backend-specific side concerns (data deletion,
  // active-namespace switching, achievements).
  const {
    namespaces,
    add: addNamespaceEntry,
    rename: renameNamespace,
    setAppearance: setNamespaceAppearanceEntry,
    remove: removeNamespaceEntry,
  } = useNamespaceRegistry(namespaceStore);

  // The at-rest encryption lifecycle: owns the encryption-mode and session-
  // passphrase state, derives the `locked` gate, and carries the enable /
  // disable / unlock verbs that re-wrap or decrypt the active document. Driven
  // by `inner` (the unwrapped scoped backend); the `adapter` memo below layers
  // `withEncryption` on top using the `encryption` / `password` it exposes.
  const {
    encryption,
    password,
    locked,
    enableEncryption,
    disableEncryption,
    unlock,
  } = useEncryption(inner);

  // The adapter handed to the app. Wrapped with encryption when on;
  // replaced by the locked placeholder until the passphrase is supplied.
  const adapter = useMemo<StorageAdapter>(() => {
    if (locked) return lockedAdapter(backend);
    return wrapForEncryption(inner, encryption, password);
  }, [inner, encryption, password, locked, backend]);

  const selectBrowser = useCallback(() => {
    switchToBackend("browser");
  }, [switchToBackend]);

  // Wrap a raw adapter in the session's encryption envelope so a folder
  // probe / seed / mirror reads and writes the same bytes the steady-state
  // app does. A no-op when encryption is off (or locked).
  const wrapForActive = useCallback(
    (raw: StorageAdapter): StorageAdapter =>
      wrapForEncryption(raw, encryption, password),
    [encryption, password],
  );

  // Refresh the latest-ref the folder hook's connect / disconnect verbs read at
  // click time. Written every render so a gesture always seeds / mirrors from
  // the current active document; the verbs can't fire before the first render
  // commits, so the ref is always current by the time one does.
  folderRuntime.current = { activeNamespace, adapter, wrapForActive };

  const switchNamespace = useCallback((slug: string) => {
    setActiveNamespaceSlug(slug);
    setActiveNamespaceState(slug);
  }, []);

  // Write a checklist into another namespace's document (the sidebar
  // drag-to-namespace). Loads the target's document, prepends the list (de-
  // duped by id), and saves — best-effort: if the target write fails (offline
  // cloud, locked) the list is left where it is and the caller keeps its local
  // copy. The caller removes the list from the source document only on success.
  const moveChecklistToNamespace = useCallback(
    async (checklist: Checklist, targetSlug: string): Promise<boolean> => {
      if (locked) return false;
      if (targetSlug === activeNamespace) return false;
      if (!namespaces.some((n) => n.slug === targetSlug)) return false;

      // The target namespace has its own folders, so the source folder link is
      // meaningless there — drop it on the way over.
      const moved = setChecklistFolder(checklist, null);

      // Build an adapter pointed at the target namespace, wrapped in the same
      // encryption envelope the active session uses so the bytes land readable.
      const target = wrapForActive(makeInner(targetSlug));
      const result = await writeMovedDocument(target, (doc) => ({
        ...doc,
        checklists: [moved, ...doc.checklists.filter((c) => c.id !== moved.id)],
      }));
      if (!result.ok) {
        log.warn(
          `moveChecklistToNamespace: target save failed (${targetSlug})`,
          result.error,
        );
        return false;
      }
      log.info(`moveChecklistToNamespace: ${checklist.id} → ${targetSlug}`);
      return true;
    },
    [locked, activeNamespace, namespaces, wrapForActive, makeInner],
  );

  // Write a whole folder and the lists inside it into another namespace's
  // document (the sidebar drag-a-folder-to-namespace). Loads the target,
  // prepends the lists (each keeping its `folderId` so it stays grouped),
  // registers the folder there, and saves — best-effort, mirroring
  // `moveChecklistToNamespace`. The caller drops the source folder and its
  // lists only on success.
  const moveFolderToNamespace = useCallback(
    async (
      folder: Folder,
      checklists: Checklist[],
      targetSlug: string,
    ): Promise<boolean> => {
      if (locked) return false;
      if (targetSlug === activeNamespace) return false;
      if (!namespaces.some((n) => n.slug === targetSlug)) return false;

      const target = wrapForActive(makeInner(targetSlug));
      // Prepend the folder's lists, de-duped by id, keeping their folder link so
      // the group lands intact; register the folder so the target knows its name.
      const movedIds = new Set(checklists.map((c) => c.id));
      const result = await writeMovedDocument(target, (doc) =>
        addFolder(
          {
            ...doc,
            checklists: [
              ...checklists,
              ...doc.checklists.filter((c) => !movedIds.has(c.id)),
            ],
          },
          folder,
        ),
      );
      if (!result.ok) {
        log.warn(
          `moveFolderToNamespace: target save failed (${targetSlug})`,
          result.error,
        );
        return false;
      }
      log.info(
        `moveFolderToNamespace: ${folder.id} (${checklists.length} lists) → ${targetSlug}`,
      );
      return true;
    },
    [locked, activeNamespace, namespaces, wrapForActive, makeInner],
  );

  const createNamespace = useCallback(
    (name: string, appearance?: NamespaceAppearance) => {
      const created = addNamespaceEntry(name, appearance);
      // Land the user in the namespace they just created.
      setActiveNamespaceSlug(created.slug);
      setActiveNamespaceState(created.slug);
      unlockAchievement("compartments");
    },
    [addNamespaceEntry],
  );

  const setNamespaceAppearance = useCallback(
    (slug: string, patch: NamespaceAppearance) => {
      setNamespaceAppearanceEntry(slug, patch);
      // Only count picking an icon / colour, not clearing one back to plain.
      if (patch.glyph || patch.color) unlockAchievement("dressUp");
    },
    [setNamespaceAppearanceEntry],
  );

  const removeNamespace = useCallback(
    async (slug: string) => {
      if (slug === DEFAULT_NAMESPACE_SLUG) {
        throw new Error("The default namespace can't be removed");
      }
      // Delete the namespace's bytes in whatever backend is active right
      // now — that's the only one we hold a connection / key for. A failure
      // (offline, revoked token) is logged but doesn't block removing the
      // registry entry; the user can clean up orphaned bytes manually.
      try {
        if (backend === "browser") {
          deleteLocalNamespace(slug);
        } else if (backend === "folder" && folderHandle) {
          // Remove the namespace's whole subfolder (and its markdown files).
          await folderHandle
            .removeEntry(slug, { recursive: true })
            .catch(() => {});
        } else if (backend === "dropbox" && dropboxToken) {
          await deleteDropboxNamespace(dropboxToken, slug);
        } else if (backend === "gdrive" && gdriveToken) {
          await deleteGdriveNamespace(gdriveToken, slug);
        }
      } catch (err) {
        log.warn(`removeNamespace: data delete failed for ${slug}`, err);
      }
      removeNamespaceEntry(slug);
      if (activeNamespace === slug) {
        setActiveNamespaceSlug(DEFAULT_NAMESPACE_SLUG);
        setActiveNamespaceState(DEFAULT_NAMESPACE_SLUG);
      }
    },
    [
      backend,
      dropboxToken,
      gdriveToken,
      activeNamespace,
      folderHandle,
      removeNamespaceEntry,
    ],
  );

  return {
    adapter,
    settingsStore,
    backend,
    dropboxConfigured: isDropboxConfigured(),
    gdriveConfigured: isGdriveConfigured(),
    dropboxConnected: dropboxToken !== null,
    gdriveConnected: gdriveToken !== null,
    folderAvailable: isFolderBackendAvailable(),
    folderConnected: backend === "folder" && folderHandle !== null,
    folderReconnectNeeded,
    encryption,
    locked,
    selectBrowser,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
    connectDropbox,
    disconnectDropbox,
    connectGdrive,
    disconnectGdrive,
    enableEncryption,
    disableEncryption,
    unlock,
    namespaces,
    activeNamespace,
    switchNamespace,
    moveChecklistToNamespace,
    moveFolderToNamespace,
    createNamespace,
    renameNamespace,
    setNamespaceAppearance,
    removeNamespace,
  };
}
