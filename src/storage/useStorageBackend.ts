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

import { useCallback, useEffect, useMemo, useState } from "react";

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
  clearDropboxRefreshToken,
  clearDropboxToken,
  clearGdriveToken,
  getBackend,
  getDropboxRefreshToken,
  getDropboxToken,
  getEncryption,
  getGdriveToken,
  setBackend as persistBackend,
  setDropboxRefreshToken,
  setDropboxToken,
  setEncryption as persistEncryption,
  setGdriveToken,
} from "./backend-preference.ts";
import {
  OfflineUnavailableError,
  localCacheKey,
  withLocalCache,
} from "./cache/index.ts";
import { decryptEnvelope, encryptText, isEncryptedEnvelope } from "./crypto.ts";
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
import {
  clearDirectoryHandle,
  ensurePermission,
  isFolderBackendAvailable,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from "./folder/handle-store.ts";
import {
  DEFAULT_NAMESPACE_SLUG,
  type Namespace,
  type NamespaceAppearance,
  getActiveNamespaceSlug,
  setActiveNamespaceSlug,
} from "./namespaces.ts";
import { useNamespaceRegistry } from "./useNamespaceRegistry.ts";

const log = createLogger("storage");

// The ordered phases turning encryption on/off passes through, surfaced to the
// settings UI so it can flash a one-line status while the work runs. `reading`,
// `saving`, and `finalizing` bracket the storage round-trip; the key-derivation
// and cipher phases (`derivingKey` / `encrypting` / `decrypting`) bubble up
// from the crypto layer — the superset keeps a single callback driving both.
export type EncryptionProgressStep =
  | "reading"
  | "derivingKey"
  | "encrypting"
  | "decrypting"
  | "saving"
  | "finalizing";
export type EncryptionProgress = (step: EncryptionProgressStep) => void;

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
  const [encryption, setEncryptionState] =
    useState<EncryptionMode>(getEncryption);
  // Session-only passphrase. Never persisted — lost on reload by design.
  const [password, setPassword] = useState<string | null>(null);
  const [activeNamespace, setActiveNamespaceState] = useState<string>(
    getActiveNamespaceSlug,
  );
  // The picked local folder (File System Access API). `null` until the
  // boot probe resolves, the user picks one, or a revoked grant drops it.
  const [folderHandle, setFolderHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  // Gates the folder branch of the adapter memo until the boot probe has
  // run, so we don't briefly build a folder adapter without a handle.
  const [folderHandleLoaded, setFolderHandleLoaded] = useState<boolean>(
    () => getBackend() !== "folder",
  );
  const [folderReconnectNeeded, setFolderReconnectNeeded] = useState(false);

  // Drop the live handle and surface the reconnect cue. Called by the
  // folder adapter when an in-flight read / write hits a revoked grant;
  // the IDB record stays so Settings can re-grant in one click.
  const markFolderPermissionLost = useCallback(() => {
    log.warn("folder: permission lost during operation");
    setFolderHandle(null);
    setFolderReconnectNeeded(true);
  }, []);

  // Boot probe: when the saved backend is the folder, load the stored
  // handle from IndexedDB and ask the OS whether the grant still stands.
  // Either rehydrate the handle or fall back to the browser store with a
  // reconnect cue (the IDB record is kept so Reconnect can re-grant).
  useEffect(() => {
    if (getBackend() !== "folder") {
      setFolderHandleLoaded(true);
      return;
    }
    let cancelled = false;
    setFolderHandleLoaded(false);
    void (async () => {
      const stored = await loadDirectoryHandle();
      if (cancelled) return;
      if (!stored) {
        setFolderHandleLoaded(true);
        return;
      }
      const status = await ensurePermission(stored, false);
      if (cancelled) return;
      if (status === "granted") setFolderHandle(stored);
      else setFolderReconnectNeeded(true);
      setFolderHandleLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        persistBackend("dropbox");
        setBackendState("dropbox");
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
  }, []);

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

  const locked = encryption === "encrypted" && password === null;

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
    persistBackend("browser");
    setBackendState("browser");
  }, []);

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

  // Pick a folder and switch to it. When the folder is empty, seed it with
  // the current document so the switch doesn't blank the screen; when it
  // already holds lists, adopt them (the folder wins). The handle is
  // persisted to IndexedDB so the grant survives reloads.
  const connectFolder = useCallback(async () => {
    if (typeof window === "undefined" || !window.showDirectoryPicker) return;
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      // AbortError = the user dismissed the picker; nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
      log.error("folder picker failed", err);
      return;
    }
    const folder = wrapForActive(
      createFolderAdapter({
        directoryHandle: handle,
        namespace: activeNamespace,
      }),
    );
    try {
      const [remote, source] = await Promise.all([
        folder.load().catch(() => null),
        adapter.load().catch(() => null),
      ]);
      if (!remote && source) await folder.save(source.text);
    } catch (err) {
      log.error("folder seed failed", err);
    }
    await saveDirectoryHandle(handle);
    persistBackend("folder");
    setFolderHandle(handle);
    setFolderReconnectNeeded(false);
    setFolderHandleLoaded(true);
    setBackendState("folder");
    unlockAchievement("localVault");
  }, [activeNamespace, adapter, wrapForActive]);

  // Re-confirm the OS grant on the already-stored handle. `requestPermission`
  // needs a user gesture, which is why this lives in a click handler.
  const reconnectFolder = useCallback(async () => {
    const stored = await loadDirectoryHandle();
    if (!stored) {
      await connectFolder();
      return;
    }
    const status = await ensurePermission(stored, true);
    if (status === "granted") {
      setFolderHandle(stored);
      setFolderReconnectNeeded(false);
    }
  }, [connectFolder]);

  // Mirror the folder's current document back into the browser store, then
  // forget the handle and switch back. Best-effort: a stale browser copy is
  // a few-edit regression at worst.
  const disconnectFolder = useCallback(async () => {
    if (folderHandle) {
      try {
        const folder = wrapForActive(
          createFolderAdapter({
            directoryHandle: folderHandle,
            namespace: activeNamespace,
          }),
        );
        const snap = await folder.load();
        if (snap) {
          const browser = wrapForActive(
            new BrowserLocalStorageAdapter(
              globalThis.localStorage,
              activeNamespace,
            ),
          );
          await browser.save(snap.text);
        }
      } catch (err) {
        log.error("folder disconnect: mirror to browser failed", err);
      }
    }
    await clearDirectoryHandle();
    persistBackend("browser");
    setFolderHandle(null);
    setFolderReconnectNeeded(false);
    setBackendState("browser");
  }, [folderHandle, activeNamespace, wrapForActive]);

  const connectDropbox = useCallback(() => {
    // Redirects away; completion (and the `cloudWalker` unlock) runs in the
    // boot effect above — a unlock queued here wouldn't survive the redirect.
    void import("./dropbox/index.ts").then((m) => m.startDropboxAuth());
  }, []);

  const disconnectDropbox = useCallback(() => {
    clearDropboxToken();
    clearDropboxRefreshToken();
    setDropboxTokenState(null);
    setDropboxRefreshState(null);
    persistBackend("browser");
    setBackendState("browser");
  }, []);

  const connectGdrive = useCallback(async () => {
    const token = await startGdriveAuth();
    setGdriveToken(token);
    setGdriveTokenState(token);
    persistBackend("gdrive");
    setBackendState("gdrive");
    unlockAchievement("cloudWalker");
  }, []);

  const disconnectGdrive = useCallback(() => {
    clearGdriveToken();
    setGdriveTokenState(null);
    persistBackend("browser");
    setBackendState("browser");
  }, []);

  const enableEncryption = useCallback(
    async (next: string, onProgress?: EncryptionProgress) => {
      if (!next) throw new Error("Passphrase is required");
      log.info("enable encryption: start");
      // Re-wrap whatever the inner backend currently holds so existing
      // plaintext becomes an envelope. A first run with no data is a
      // no-op beyond flipping the flag.
      onProgress?.("reading");
      const snap = await inner.load();
      if (snap && !isEncryptedEnvelope(snap.text)) {
        const payload = await encryptText(snap.text, next, onProgress);
        onProgress?.("saving");
        await inner.save(payload, snap.revision);
      }
      onProgress?.("finalizing");
      persistEncryption("encrypted");
      setEncryptionState("encrypted");
      setPassword(next);
      log.info("enable encryption: done");
      unlockAchievement("paranoidMode");
    },
    [inner],
  );

  const disableEncryption = useCallback(
    async (onProgress?: EncryptionProgress) => {
      if (password === null) {
        throw new Error("Unlock before turning encryption off");
      }
      log.info("disable encryption: start");
      // Rewrite the document at rest as plaintext and drop the encrypted blob.
      // Decrypt when the load surfaced the envelope; when a stale plaintext
      // copy shadows the blob (a both-representations state a backend can drift
      // into), the load returns that document instead, so re-save it as-is.
      // Either way the plaintext write makes the directory adapter clear the
      // superseded `checklist.json`, so disabling can't leave the envelope
      // behind — gating the re-save on the load happening to surface the
      // envelope is what let the file linger.
      onProgress?.("reading");
      const snap = await inner.load();
      if (snap) {
        const plaintext = isEncryptedEnvelope(snap.text)
          ? await decryptEnvelope(snap.text, password, onProgress)
          : snap.text;
        onProgress?.("saving");
        await inner.save(plaintext, snap.revision);
      }
      onProgress?.("finalizing");
      persistEncryption("plaintext");
      setEncryptionState("plaintext");
      setPassword(null);
      log.info("disable encryption: done");
    },
    [inner, password],
  );

  const unlock = useCallback(
    async (candidate: string, onProgress?: EncryptionProgress) => {
      if (!candidate) throw new Error("Passphrase is required");
      // Verify by decrypting the stored envelope. For a cloud backend the
      // load falls back to the on-device cache when offline, so the
      // passphrase can be checked in airplane mode against the cached
      // ciphertext. If the backend is unreachable *and* nothing is cached,
      // map it to a distinct error so the gate says "you're offline" instead
      // of the misleading "wrong passphrase".
      onProgress?.("reading");
      let snap: StoredSnapshot | null;
      try {
        snap = await inner.load();
      } catch (err) {
        log.warn("unlock: backend unreachable and no cached copy", err);
        throw new OfflineUnavailableError();
      }
      // Plaintext-at-rest (the re-wrap never ran) can't be verified, so it
      // unlocks optimistically. `decryptEnvelope` reports the `derivingKey`
      // and `decrypting` phases itself.
      if (snap && isEncryptedEnvelope(snap.text)) {
        await decryptEnvelope(snap.text, candidate, onProgress); // throws on wrong pass
      }
      onProgress?.("finalizing");
      setPassword(candidate);
    },
    [inner],
  );

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
