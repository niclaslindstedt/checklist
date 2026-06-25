// Local-folder (File System Access API) storage lifecycle as a React hook:
// owns the picked directory handle plus its boot-probe / reconnect / revoked-
// grant state, persists the grant across reloads via IndexedDB, and carries the
// connect / reconnect / disconnect verbs. Peeled out of `useStorageBackend` so
// the folder grant flow is unit-testable against a mocked handle-store and
// picker instead of a live File System Access grant, mirroring how
// `useEncryption` and `useNamespaceRegistry` were extracted.
//
// The connect / disconnect verbs read the active document — to seed a freshly
// picked empty folder, and to mirror the folder back into the browser store on
// disconnect. Those depend on `adapter` / `wrapForActive`, which are built
// downstream of the folder handle (the active adapter is selected *from* the
// handle), so they arrive through a latest-ref (`runtime`) the caller refreshes
// each render rather than as hook arguments. The verbs only fire on user
// gestures, by which point that ref is current — the same latest-ref idiom
// `usePullToRefresh` uses for its `onRefresh` callback.

import { useCallback, useEffect, useState } from "react";

// Aliased to match `useStorageBackend`, which exposes an encryption `unlock`
// verb of its own; the achievement bus's `unlock` comes in under a distinct
// name. Kept inline at the connect site so the catalog test's static
// `unlock("<id>")` scan still proves `localVault` is wired.
import { unlock as unlockAchievement } from "../achievements/bus.ts";
import { createLogger } from "../dev/logger.ts";
import type { StorageAdapter } from "./adapter.ts";
import { type BackendId, getBackend } from "./backend-preference.ts";
import { createFolderAdapter } from "./folder/index.ts";
import {
  clearDirectoryHandle,
  ensurePermission,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from "./folder/handle-store.ts";
import { BrowserLocalStorageAdapter } from "./local/index.ts";

const log = createLogger("storage");

// The downstream values the connect / disconnect verbs read at click time: the
// active namespace whose document seeds / mirrors, the live active adapter
// (read to seed a freshly-picked empty folder), and the encryption-envelope
// wrapper so the seeded / mirrored bytes match the steady-state app's.
export interface FolderRuntime {
  activeNamespace: string;
  adapter: StorageAdapter;
  wrapForActive: (raw: StorageAdapter) => StorageAdapter;
}

export interface FolderHandle {
  /** The picked folder handle, or null while probing / after a revoked grant. */
  folderHandle: FileSystemDirectoryHandle | null;
  /** True once the boot probe has resolved (gates the folder adapter branch). */
  folderHandleLoaded: boolean;
  /** Set when the stored grant needs re-confirming (the OS revoked it). */
  folderReconnectNeeded: boolean;
  /** Drop the live handle and surface the reconnect cue (revoked mid-op). */
  markFolderPermissionLost: () => void;
  /** Pick a folder, seed it from the current document, and switch to it. */
  connectFolder: () => Promise<void>;
  /** Re-confirm the OS grant on the already-picked folder. */
  reconnectFolder: () => Promise<void>;
  /** Mirror the folder back into the browser store, then forget the folder. */
  disconnectFolder: () => Promise<void>;
}

export function useFolderHandle(
  switchToBackend: (id: BackendId) => void,
  runtime: { current: FolderRuntime },
): FolderHandle {
  // The picked local folder (File System Access API). `null` until the boot
  // probe resolves, the user picks one, or a revoked grant drops it.
  const [folderHandle, setFolderHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  // Gates the folder branch of the caller's adapter memo until the boot probe
  // has run, so we don't briefly build a folder adapter without a handle.
  const [folderHandleLoaded, setFolderHandleLoaded] = useState<boolean>(
    () => getBackend() !== "folder",
  );
  const [folderReconnectNeeded, setFolderReconnectNeeded] = useState(false);

  // Drop the live handle and surface the reconnect cue. Called by the folder
  // adapter when an in-flight read / write hits a revoked grant; the IDB record
  // stays so Settings can re-grant in one click.
  const markFolderPermissionLost = useCallback(() => {
    log.warn("folder: permission lost during operation");
    setFolderHandle(null);
    setFolderReconnectNeeded(true);
  }, []);

  // Boot probe: when the saved backend is the folder, load the stored handle
  // from IndexedDB and ask the OS whether the grant still stands. Either
  // rehydrate the handle or fall back to the browser store with a reconnect cue
  // (the IDB record is kept so Reconnect can re-grant).
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

  // Pick a folder and switch to it. When the folder is empty, seed it with the
  // current document so the switch doesn't blank the screen; when it already
  // holds lists, adopt them (the folder wins). The handle is persisted to
  // IndexedDB so the grant survives reloads.
  const connectFolder = useCallback(async () => {
    if (typeof window === "undefined" || !window.showDirectoryPicker) return;
    const { activeNamespace, adapter, wrapForActive } = runtime.current;
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
    setFolderHandle(handle);
    setFolderReconnectNeeded(false);
    setFolderHandleLoaded(true);
    switchToBackend("folder");
    unlockAchievement("localVault");
  }, [switchToBackend, runtime]);

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
  // forget the handle and switch back. Best-effort: a stale browser copy is a
  // few-edit regression at worst.
  const disconnectFolder = useCallback(async () => {
    const { activeNamespace, wrapForActive } = runtime.current;
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
    setFolderHandle(null);
    setFolderReconnectNeeded(false);
    switchToBackend("browser");
  }, [folderHandle, switchToBackend, runtime]);

  return {
    folderHandle,
    folderHandleLoaded,
    folderReconnectNeeded,
    markFolderPermissionLost,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
  };
}
