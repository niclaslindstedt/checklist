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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  clearDropboxTokens,
  clearGdriveToken,
  getBackend,
  getDropboxRefreshToken,
  getDropboxToken,
  getGdriveToken,
  setBackend as persistBackend,
  setDropboxRefreshToken,
  setDropboxToken,
  setGdriveToken,
} from "./backend-preference.ts";
import { localCacheKey, withLocalCache } from "./cache/index.ts";
import {
  type DropboxAuth,
  completeDropboxAuth,
  createDropboxAdapter,
  createDropboxNamespaceStore,
  createDropboxSettingsStore,
  deleteDropboxNamespace,
  hasPendingDropboxAuth,
  isDropboxConfigured,
} from "./dropbox/index.ts";
import { withEncryption } from "./encrypting/index.ts";
import {
  createGdriveAdapter,
  createGdriveNamespaceStore,
  createGdriveSettingsStore,
  deleteGdriveNamespace,
  isGdriveConfigured,
  startGdriveAuth,
} from "./gdrive/index.ts";
import {
  BrowserLocalStorageAdapter,
  deleteLocalNamespace,
} from "./local/index.ts";
import {
  createFolderAdapter,
  createFolderNamespaceStore,
  createFolderSettingsStore,
} from "./folder/index.ts";
import { parse, serialize } from "./serialize.ts";
import type { SettingsStore } from "./settings-store.ts";
import type { NamespaceRegistryStore } from "./namespace-store.ts";
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

// Strip the OAuth redirect's query params (`code`, `state`, `scope`) from
// the address bar without reloading, so a refresh doesn't replay a
// spent authorization code.
function cleanAuthParamsFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    let touched = false;
    for (const key of ["code", "state", "scope"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        touched = true;
      }
    }
    if (touched) {
      window.history.replaceState(null, "", url.toString());
    }
  } catch (err) {
    log.warn("failed to clean auth params from URL", err);
  }
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

// The resolved active backend, computed once per change so the
// namespace-scoped document adapter and the root settings store are built
// from the same branch instead of re-deriving the `backend && token` chain
// twice. Carries exactly what each builder needs.
type BackendSelection =
  | { kind: "dropbox"; auth: DropboxAuth }
  | { kind: "gdrive"; token: string }
  | { kind: "folder"; handle: FileSystemDirectoryHandle }
  | { kind: "browser" };

export function useStorageBackend(): UseStorageBackend {
  const [backend, setBackendState] = useState<BackendId>(getBackend);
  const [dropboxToken, setDropboxTokenState] = useState<string | null>(
    getDropboxToken,
  );
  const [dropboxRefresh, setDropboxRefreshState] = useState<string | null>(
    getDropboxRefreshToken,
  );
  const [gdriveToken, setGdriveTokenState] = useState<string | null>(
    getGdriveToken,
  );
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

  // Complete a Dropbox OAuth redirect on boot. Google Drive uses a popup
  // (resolved inline in `connectGdrive`), so only Dropbox lands back here
  // with a `?code=`.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code || !hasPendingDropboxAuth()) return;
    let cancelled = false;
    void (async () => {
      try {
        log.info("boot: completing Dropbox OAuth redirect");
        const result = await completeDropboxAuth(code);
        if (cancelled) return;
        setDropboxToken(result.accessToken);
        setDropboxTokenState(result.accessToken);
        if (result.refreshToken) {
          setDropboxRefreshToken(result.refreshToken);
          setDropboxRefreshState(result.refreshToken);
        }
        switchToBackend("dropbox");
        unlockAchievement("cloudWalker");
      } catch (err) {
        log.error("boot: Dropbox OAuth completion failed", err);
      } finally {
        if (!cancelled) cleanAuthParamsFromUrl();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [switchToBackend]);

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
          onAccessTokenRefreshed: (token) => {
            setDropboxToken(token);
            setDropboxTokenState(token);
          },
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
    folderHandle,
    folderHandleLoaded,
  ]);

  // Build the unwrapped, namespace-scoped backend for any slug. Factored out
  // of the `inner` memo so a cross-namespace move can spin up an adapter
  // pointed at the *target* namespace's document without switching the active
  // one. Cloud adapters get fresh tokens on every change so a reconnect
  // rebuilds them; the Dropbox adapter persists any silently-refreshed access
  // token back to localStorage and state via the selection's
  // `onAccessTokenRefreshed`.
  const makeInner = useCallback(
    (slug: string): StorageAdapter => {
      switch (selection.kind) {
        // Cloud backends mirror their bytes into a local cache so the document
        // can be unlocked, read, and edited offline (the cache holds the
        // encrypted envelope when encryption is on). Folder / browser are
        // already on-device, so they need no mirror.
        case "dropbox":
          return withLocalCache(
            createDropboxAdapter(selection.auth, fetch, slug),
            {
              storage: globalThis.localStorage,
              key: localCacheKey("dropbox", slug),
            },
          );
        case "gdrive":
          return withLocalCache(
            createGdriveAdapter(selection.token, fetch, slug),
            {
              storage: globalThis.localStorage,
              key: localCacheKey("gdrive", slug),
            },
          );
        case "folder":
          return createFolderAdapter({
            directoryHandle: selection.handle,
            namespace: slug,
            onPermissionLost: markFolderPermissionLost,
          });
        case "browser":
          return new BrowserLocalStorageAdapter(globalThis.localStorage, slug);
      }
    },
    [selection, markFolderPermissionLost],
  );

  // The active namespace's scoped backend — the document the app reads/writes.
  const inner = useMemo<StorageAdapter>(
    () => makeInner(activeNamespace),
    [makeInner, activeNamespace],
  );

  // The active backend's root settings store — the same selection as
  // `inner` but rooted at the app folder (no namespace) and independent of
  // encryption (settings are app-wide plaintext). Null for the browser
  // backend (localStorage is its canonical settings home) and while a
  // folder grant is unresolved.
  const settingsStore = useMemo<SettingsStore | null>(() => {
    switch (selection.kind) {
      case "dropbox":
        return createDropboxSettingsStore(selection.auth, fetch);
      case "gdrive":
        return createGdriveSettingsStore(selection.token, fetch);
      case "folder":
        return createFolderSettingsStore(
          selection.handle,
          markFolderPermissionLost,
        );
      case "browser":
        return null;
    }
  }, [selection, markFolderPermissionLost]);

  // The active backend's root namespace registry — `namespaces.json` beside
  // `settings.json` at the app-folder root, so the list of namespaces travels
  // with the synced/shared folder and lands on every device that connects
  // the backend. Null for the browser backend (localStorage is its only home)
  // and while a folder grant is unresolved.
  const namespaceStore = useMemo<NamespaceRegistryStore | null>(() => {
    switch (selection.kind) {
      case "dropbox":
        return createDropboxNamespaceStore(selection.auth, fetch);
      case "gdrive":
        return createGdriveNamespaceStore(selection.token, fetch);
      case "folder":
        return createFolderNamespaceStore(
          selection.handle,
          markFolderPermissionLost,
        );
      case "browser":
        return null;
    }
  }, [selection, markFolderPermissionLost]);

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
    if (encryption === "encrypted") {
      return withEncryption(inner, { current: password });
    }
    return inner;
  }, [inner, encryption, password, locked, backend]);

  const selectBrowser = useCallback(() => {
    switchToBackend("browser");
  }, [switchToBackend]);

  // Wrap a raw adapter in the session's encryption envelope so a folder
  // probe / seed / mirror reads and writes the same bytes the steady-state
  // app does. A no-op when encryption is off (or locked).
  const wrapForActive = useCallback(
    (raw: StorageAdapter): StorageAdapter =>
      encryption === "encrypted" && password !== null
        ? withEncryption(raw, { current: password })
        : raw,
    [encryption, password],
  );

  // Refresh the latest-ref the folder hook's connect / disconnect verbs read at
  // click time. Written every render so a gesture always seeds / mirrors from
  // the current active document; the verbs can't fire before the first render
  // commits, so the ref is always current by the time one does.
  folderRuntime.current = { activeNamespace, adapter, wrapForActive };

  // The common tail of every cloud `disconnect*`: fall back to the browser
  // store. Each backend's disconnect clears its own tokens and then routes
  // through here (no achievement — falling back isn't an unlock).
  const switchToBrowser = useCallback(() => {
    switchToBackend("browser");
  }, [switchToBackend]);

  const connectDropbox = useCallback(() => {
    // Redirects away; completion (and the `cloudWalker` unlock) runs in the
    // boot effect above — a unlock queued here wouldn't survive the redirect.
    void import("./dropbox/index.ts").then((m) => m.startDropboxAuth());
  }, []);

  const disconnectDropbox = useCallback(() => {
    clearDropboxTokens();
    setDropboxTokenState(null);
    setDropboxRefreshState(null);
    switchToBrowser();
  }, [switchToBrowser]);

  const connectGdrive = useCallback(async () => {
    const token = await startGdriveAuth();
    setGdriveToken(token);
    setGdriveTokenState(token);
    switchToBackend("gdrive");
    unlockAchievement("cloudWalker");
  }, [switchToBackend]);

  const disconnectGdrive = useCallback(() => {
    clearGdriveToken();
    setGdriveTokenState(null);
    switchToBrowser();
  }, [switchToBrowser]);

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
      const prev = await target.load().catch(() => null);
      const doc = parse(prev?.text ?? null);
      doc.checklists = [
        moved,
        ...doc.checklists.filter((c) => c.id !== moved.id),
      ];
      try {
        await target.save(serialize(doc), prev?.revision);
      } catch (err) {
        log.warn(
          `moveChecklistToNamespace: target save failed (${targetSlug})`,
          err,
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
      const prev = await target.load().catch(() => null);
      let doc = parse(prev?.text ?? null);
      // Prepend the folder's lists, de-duped by id, keeping their folder link so
      // the group lands intact; register the folder so the target knows its name.
      const movedIds = new Set(checklists.map((c) => c.id));
      doc.checklists = [
        ...checklists,
        ...doc.checklists.filter((c) => !movedIds.has(c.id)),
      ];
      doc = addFolder(doc, folder);
      try {
        await target.save(serialize(doc), prev?.revision);
      } catch (err) {
        log.warn(
          `moveFolderToNamespace: target save failed (${targetSlug})`,
          err,
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
