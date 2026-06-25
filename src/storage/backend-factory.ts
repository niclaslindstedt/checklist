// Single source of truth for building the per-backend stores from a resolved
// backend selection, plus the "should this adapter be encryption-wrapped?"
// decision.
//
// `createBackendFactory` collapses what used to be three parallel
// `switch (selection.kind)` builders in `useStorageBackend` — the
// namespace-scoped document adapter (`makeInner`), the root settings store,
// and the root namespace registry store — into one switch with a single case
// per backend. Adding a fourth backend is one new case here, not three
// separate switches to keep in lockstep (miss one and a backend silently
// loses its settings or namespace sync).
//
// `wrapForEncryption` is the other shared storage decision: both the
// steady-state `adapter` memo and the folder seed / mirror `wrapForActive`
// path route through it, so the locked / plaintext / encrypted matrix lives in
// exactly one place instead of being re-derived at each wrapping site.

import type { StorageAdapter } from "./adapter.ts";
import type { EncryptionMode } from "./backend-preference.ts";
import { withEncryption } from "./encrypting/index.ts";
import { localCacheKey, withLocalCache } from "./cache/index.ts";
import {
  type DropboxAuth,
  createDropboxAdapter,
  createDropboxNamespaceStore,
  createDropboxSettingsStore,
} from "./dropbox/index.ts";
import {
  createGdriveAdapter,
  createGdriveNamespaceStore,
  createGdriveSettingsStore,
} from "./gdrive/index.ts";
import { BrowserLocalStorageAdapter } from "./local/index.ts";
import {
  createFolderAdapter,
  createFolderNamespaceStore,
  createFolderSettingsStore,
} from "./folder/index.ts";
import type { SettingsStore } from "./settings-store.ts";
import type { NamespaceRegistryStore } from "./namespace-store.ts";

/**
 * The resolved active backend, computed once per change so every per-backend
 * store is built from the same branch instead of re-deriving the
 * `backend && token` chain at each builder. Carries exactly what each builder
 * needs. The Dropbox `auth` carries the access-token refresh seam
 * (`onAccessTokenRefreshed`) so a silently-refreshed token still flows back to
 * state and localStorage.
 */
export type BackendSelection =
  | { kind: "dropbox"; auth: DropboxAuth }
  | { kind: "gdrive"; token: string }
  | { kind: "folder"; handle: FileSystemDirectoryHandle }
  | { kind: "browser" };

/** The injectable side-effecting seams the cloud / cache builders reach for. */
export interface BackendFactoryDeps {
  /** Network transport handed to the cloud adapters and their stores. */
  fetchImpl: typeof fetch;
  /** Backing store for the browser adapter and the cloud offline cache. */
  storage: Storage;
  /** Raised by the folder backend when the OS revokes the directory grant. */
  onFolderPermissionLost: () => void;
}

/**
 * Everything a single backend selection knows how to build. `makeInner` is a
 * factory (a cross-namespace move spins one up pointed at the target slug
 * without switching the active namespace); the two root stores are
 * namespace-agnostic and so are built once. `settingsStore` / `namespaceStore`
 * are null for the browser backend, which keeps both in localStorage.
 */
export interface BackendFactory {
  /** Build the unwrapped, namespace-scoped document adapter for any slug. */
  makeInner: (slug: string) => StorageAdapter;
  /** The root `settings.json` store, or null for the browser backend. */
  settingsStore: SettingsStore | null;
  /** The root `namespaces.json` registry store, or null for browser. */
  namespaceStore: NamespaceRegistryStore | null;
}

/**
 * Build every per-backend store for one resolved selection. One switch, one
 * case per backend, each case wiring up all three things a backend provides.
 *
 * Cloud backends mirror their bytes into the local cache (`withLocalCache`) so
 * the document can be read and edited offline; folder / browser are already
 * on-device and need no mirror. Cloud adapters are rebuilt with fresh tokens
 * on every selection change so a reconnect re-points them.
 */
export function createBackendFactory(
  selection: BackendSelection,
  deps: BackendFactoryDeps,
): BackendFactory {
  const { fetchImpl, storage, onFolderPermissionLost } = deps;
  switch (selection.kind) {
    case "dropbox": {
      const { auth } = selection;
      return {
        makeInner: (slug) =>
          withLocalCache(createDropboxAdapter(auth, fetchImpl, slug), {
            storage,
            key: localCacheKey("dropbox", slug),
          }),
        settingsStore: createDropboxSettingsStore(auth, fetchImpl),
        namespaceStore: createDropboxNamespaceStore(auth, fetchImpl),
      };
    }
    case "gdrive": {
      const { token } = selection;
      return {
        makeInner: (slug) =>
          withLocalCache(createGdriveAdapter(token, fetchImpl, slug), {
            storage,
            key: localCacheKey("gdrive", slug),
          }),
        settingsStore: createGdriveSettingsStore(token, fetchImpl),
        namespaceStore: createGdriveNamespaceStore(token, fetchImpl),
      };
    }
    case "folder": {
      const { handle } = selection;
      return {
        makeInner: (slug) =>
          createFolderAdapter({
            directoryHandle: handle,
            namespace: slug,
            onPermissionLost: onFolderPermissionLost,
          }),
        settingsStore: createFolderSettingsStore(handle, onFolderPermissionLost),
        namespaceStore: createFolderNamespaceStore(
          handle,
          onFolderPermissionLost,
        ),
      };
    }
    case "browser":
      return {
        makeInner: (slug) => new BrowserLocalStorageAdapter(storage, slug),
        settingsStore: null,
        namespaceStore: null,
      };
  }
}

/**
 * Wrap `raw` in the session encryption envelope when encryption is on and a
 * passphrase is held; otherwise return it untouched. A null `password`
 * (encryption on but locked, or encryption off) passes through, so a wrapped
 * adapter is only ever produced with a usable key.
 */
export function wrapForEncryption(
  raw: StorageAdapter,
  mode: EncryptionMode,
  password: string | null,
): StorageAdapter {
  return mode === "encrypted" && password !== null
    ? withEncryption(raw, { current: password })
    : raw;
}
