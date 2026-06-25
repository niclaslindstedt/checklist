// @vitest-environment jsdom
// Direct coverage for `useFolderHandle`, peeled out of `useStorageBackend` so
// the local-folder (File System Access) boot probe, connect / seed,
// reconnect / re-grant, and disconnect / mirror flows are testable against a
// mocked handle-store and directory picker instead of a live OS grant — which
// Vitest can't reach. The handle-store (IndexedDB) and the folder adapter
// (file-system writes) are mocked at the module boundary; the active document
// the verbs read at click time arrives through the `runtime` latest-ref the
// hook takes, built per test.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StorageAdapter,
  StoredSnapshot,
} from "../../src/storage/adapter.ts";
import { setBackend } from "../../src/storage/backend-preference.ts";
import { BrowserLocalStorageAdapter } from "../../src/storage/local/index.ts";

// Shared mock state, hoisted so the `vi.mock` factories below can close over it.
const h = vi.hoisted(() => ({
  loadDirectoryHandle: vi.fn<() => Promise<unknown>>(),
  saveDirectoryHandle: vi.fn<(handle: unknown) => Promise<void>>(),
  clearDirectoryHandle: vi.fn<() => Promise<void>>(),
  ensurePermission: vi.fn<(...args: unknown[]) => Promise<string>>(),
  // The folder adapter double: a single in-memory document plus a save log so a
  // test can assert whether `connectFolder` seeded an empty folder.
  folderDoc: null as string | null,
  folderSaves: [] as string[],
}));

vi.mock("../../src/storage/folder/handle-store.ts", () => ({
  loadDirectoryHandle: h.loadDirectoryHandle,
  saveDirectoryHandle: h.saveDirectoryHandle,
  clearDirectoryHandle: h.clearDirectoryHandle,
  ensurePermission: h.ensurePermission,
  isFolderBackendAvailable: () => true,
}));

vi.mock("../../src/storage/folder/index.ts", () => ({
  createFolderAdapter: (): StorageAdapter => ({
    id: "folder",
    label: "Local folder",
    capabilities: new Set(),
    async load(): Promise<StoredSnapshot | null> {
      return h.folderDoc === null ? null : { text: h.folderDoc };
    },
    async save(text: string): Promise<StoredSnapshot> {
      h.folderDoc = text;
      h.folderSaves.push(text);
      return { text };
    },
  }),
}));

import {
  type FolderRuntime,
  useFolderHandle,
} from "../../src/storage/useFolderHandle.ts";

// A fake directory handle — opaque to the hook, which only stashes / forwards
// it. Distinct objects so identity assertions are meaningful.
function fakeHandle(label: string): FileSystemDirectoryHandle {
  return { name: label } as unknown as FileSystemDirectoryHandle;
}

// The latest-ref the connect / disconnect verbs read: the active namespace and
// the live active adapter (the seed source) plus a no-op encryption wrapper.
function makeRuntime(
  source: string | null = null,
  activeNamespace = "default",
): { current: FolderRuntime } {
  const adapter: StorageAdapter = {
    id: "browser",
    label: "Source",
    capabilities: new Set(),
    async load(): Promise<StoredSnapshot | null> {
      return source === null ? null : { text: source };
    },
    async save(text: string): Promise<StoredSnapshot> {
      return { text };
    },
  };
  return {
    current: { activeNamespace, adapter, wrapForActive: (raw) => raw },
  };
}

function setPicker(handle: FileSystemDirectoryHandle | "abort" | "missing") {
  if (handle === "missing") {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    return;
  }
  (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
    vi.fn(async () => {
      if (handle === "abort") {
        throw new DOMException("dismissed", "AbortError");
      }
      return handle;
    });
}

beforeEach(() => {
  localStorage.clear();
  h.loadDirectoryHandle.mockReset().mockResolvedValue(null);
  h.saveDirectoryHandle.mockReset().mockResolvedValue(undefined);
  h.clearDirectoryHandle.mockReset().mockResolvedValue(undefined);
  h.ensurePermission.mockReset().mockResolvedValue("granted");
  h.folderDoc = null;
  h.folderSaves = [];
});

afterEach(() => {
  localStorage.clear();
});

describe("useFolderHandle", () => {
  it("starts with no handle, loaded, and no reconnect cue on a non-folder backend", () => {
    const switchToBackend = vi.fn();
    const { result } = renderHook(() =>
      useFolderHandle(switchToBackend, makeRuntime()),
    );
    expect(result.current.folderHandle).toBeNull();
    expect(result.current.folderHandleLoaded).toBe(true);
    expect(result.current.folderReconnectNeeded).toBe(false);
  });

  it("boot probe rehydrates a still-granted stored handle", async () => {
    setBackend("folder");
    const stored = fakeHandle("stored");
    h.loadDirectoryHandle.mockResolvedValue(stored);
    h.ensurePermission.mockResolvedValue("granted");

    const { result } = renderHook(() =>
      useFolderHandle(vi.fn(), makeRuntime()),
    );

    await waitFor(() => expect(result.current.folderHandleLoaded).toBe(true));
    expect(result.current.folderHandle).toBe(stored);
    expect(result.current.folderReconnectNeeded).toBe(false);
    // Boot probe must not request the grant (no user gesture).
    expect(h.ensurePermission).toHaveBeenCalledWith(stored, false);
  });

  it("boot probe surfaces a reconnect cue when the grant lapsed", async () => {
    setBackend("folder");
    h.loadDirectoryHandle.mockResolvedValue(fakeHandle("stored"));
    h.ensurePermission.mockResolvedValue("prompt-denied");

    const { result } = renderHook(() =>
      useFolderHandle(vi.fn(), makeRuntime()),
    );

    await waitFor(() => expect(result.current.folderHandleLoaded).toBe(true));
    expect(result.current.folderHandle).toBeNull();
    expect(result.current.folderReconnectNeeded).toBe(true);
  });

  it("boot probe with no stored handle just marks loaded", async () => {
    setBackend("folder");
    h.loadDirectoryHandle.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useFolderHandle(vi.fn(), makeRuntime()),
    );

    await waitFor(() => expect(result.current.folderHandleLoaded).toBe(true));
    expect(result.current.folderHandle).toBeNull();
    expect(h.ensurePermission).not.toHaveBeenCalled();
  });

  it("markFolderPermissionLost drops the handle and cues reconnect", async () => {
    const switchToBackend = vi.fn();
    setPicker(fakeHandle("picked"));
    const { result } = renderHook(() =>
      useFolderHandle(switchToBackend, makeRuntime("source doc")),
    );
    await act(async () => {
      await result.current.connectFolder();
    });
    expect(result.current.folderHandle).not.toBeNull();

    act(() => result.current.markFolderPermissionLost());

    expect(result.current.folderHandle).toBeNull();
    expect(result.current.folderReconnectNeeded).toBe(true);
  });

  it("connectFolder seeds an empty folder from the active document", async () => {
    const switchToBackend = vi.fn();
    const picked = fakeHandle("picked");
    setPicker(picked);
    h.folderDoc = null; // folder starts empty → seed from source
    const { result } = renderHook(() =>
      useFolderHandle(switchToBackend, makeRuntime("the source document")),
    );

    await act(async () => {
      await result.current.connectFolder();
    });

    expect(h.folderSaves).toContain("the source document");
    expect(h.saveDirectoryHandle).toHaveBeenCalledWith(picked);
    expect(switchToBackend).toHaveBeenCalledWith("folder");
    expect(result.current.folderHandle).toBe(picked);
    expect(result.current.folderHandleLoaded).toBe(true);
    expect(result.current.folderReconnectNeeded).toBe(false);
  });

  it("connectFolder adopts a non-empty folder without seeding", async () => {
    const switchToBackend = vi.fn();
    setPicker(fakeHandle("picked"));
    h.folderDoc = "lists already in the folder"; // non-empty → folder wins
    const { result } = renderHook(() =>
      useFolderHandle(switchToBackend, makeRuntime("the source document")),
    );

    await act(async () => {
      await result.current.connectFolder();
    });

    expect(h.folderSaves).toHaveLength(0);
    expect(switchToBackend).toHaveBeenCalledWith("folder");
  });

  it("connectFolder ignores a dismissed picker", async () => {
    const switchToBackend = vi.fn();
    setPicker("abort");
    const { result } = renderHook(() =>
      useFolderHandle(switchToBackend, makeRuntime("source")),
    );

    await act(async () => {
      await result.current.connectFolder();
    });

    expect(result.current.folderHandle).toBeNull();
    expect(switchToBackend).not.toHaveBeenCalled();
    expect(h.saveDirectoryHandle).not.toHaveBeenCalled();
  });

  it("connectFolder is a no-op without the File System Access API", async () => {
    const switchToBackend = vi.fn();
    setPicker("missing");
    const { result } = renderHook(() =>
      useFolderHandle(switchToBackend, makeRuntime("source")),
    );

    await act(async () => {
      await result.current.connectFolder();
    });

    expect(switchToBackend).not.toHaveBeenCalled();
    expect(result.current.folderHandle).toBeNull();
  });

  it("reconnectFolder re-grants the stored handle", async () => {
    const stored = fakeHandle("stored");
    h.loadDirectoryHandle.mockResolvedValue(stored);
    h.ensurePermission.mockResolvedValue("granted");
    const { result } = renderHook(() =>
      useFolderHandle(vi.fn(), makeRuntime()),
    );

    await act(async () => {
      await result.current.reconnectFolder();
    });

    expect(result.current.folderHandle).toBe(stored);
    expect(result.current.folderReconnectNeeded).toBe(false);
    // The re-grant runs in a gesture, so it may request the permission.
    expect(h.ensurePermission).toHaveBeenCalledWith(stored, true);
  });

  it("reconnectFolder falls back to connect when nothing is stored", async () => {
    const switchToBackend = vi.fn();
    h.loadDirectoryHandle.mockResolvedValue(null);
    const picked = fakeHandle("picked");
    setPicker(picked);
    const { result } = renderHook(() =>
      useFolderHandle(switchToBackend, makeRuntime("source")),
    );

    await act(async () => {
      await result.current.reconnectFolder();
    });

    expect(result.current.folderHandle).toBe(picked);
    expect(switchToBackend).toHaveBeenCalledWith("folder");
  });

  it("disconnectFolder mirrors the folder back to the browser store and switches back", async () => {
    const switchToBackend = vi.fn();
    setPicker(fakeHandle("picked"));
    const { result } = renderHook(() =>
      useFolderHandle(switchToBackend, makeRuntime("source", "work")),
    );
    // Connect first so a live handle is held, then seed the folder document.
    await act(async () => {
      await result.current.connectFolder();
    });
    h.folderDoc = "folder document to mirror";
    switchToBackend.mockClear();

    await act(async () => {
      await result.current.disconnectFolder();
    });

    expect(h.clearDirectoryHandle).toHaveBeenCalled();
    expect(switchToBackend).toHaveBeenCalledWith("browser");
    expect(result.current.folderHandle).toBeNull();
    expect(result.current.folderReconnectNeeded).toBe(false);
    // The folder's document landed in the active namespace's browser store.
    const browser = new BrowserLocalStorageAdapter(localStorage, "work");
    expect((await browser.load())?.text).toBe("folder document to mirror");
  });
});
