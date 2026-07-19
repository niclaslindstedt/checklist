// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ICloudStorageAdapter,
  createICloudAdapter,
  deleteICloudNamespace,
} from "../../src/storage/icloud/index.ts";
import { namespaceLocalKey } from "../../src/storage/namespaces.ts";

type MutableGlobal = { __native?: unknown };

// A fake native iCloud bridge backed by an in-memory map, plus a hook to fire
// a cross-device change into any live `subscribe` listener.
function installFakeICloud(): {
  store: Map<string, string>;
  fireChange: (changedKeys: string[] | null) => void;
  remove: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, string>();
  const listeners = new Set<(keys: string[] | null) => void>();
  const remove = vi.fn(async (key: string) => {
    store.delete(key);
  });
  const icloud = {
    load: async (key: string) => {
      const text = store.get(key);
      return text === undefined ? null : { text };
    },
    save: async (key: string, text: string) => {
      store.set(key, text);
      return { text };
    },
    remove,
    getRevision: async () => null,
    subscribe: (listener: (keys: string[] | null) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  (globalThis as MutableGlobal).__native = { platform: "ios", icloud };
  return {
    store,
    remove,
    fireChange: (changedKeys) => listeners.forEach((l) => l(changedKeys)),
  };
}

afterEach(() => {
  delete (globalThis as MutableGlobal).__native;
  vi.restoreAllMocks();
});

describe("ICloudStorageAdapter", () => {
  it("advertises the iCloud identity and only the watch capability", () => {
    installFakeICloud();
    const adapter = new ICloudStorageAdapter("default");
    expect(adapter.id).toBe("icloud");
    expect(adapter.label).toBe("iCloud");
    expect(adapter.capabilities.has("watch")).toBe(true);
    expect(adapter.capabilities.has("loadSync")).toBe(false);
    expect(adapter.capabilities.has("getRevision")).toBe(false);
  });

  it("round-trips a document through the bridge under the namespace key", async () => {
    const { store } = installFakeICloud();
    const adapter = createICloudAdapter("family");
    expect(await adapter.load()).toBeNull();

    await adapter.save('{"hello":"world"}');
    expect(store.get(namespaceLocalKey("family"))).toBe('{"hello":"world"}');
    expect(await adapter.load()).toEqual({ text: '{"hello":"world"}' });
  });

  it("treats a read failure as an empty document rather than throwing", async () => {
    installFakeICloud();
    const icloud = (globalThis as { __native: { icloud: { load: unknown } } })
      .__native.icloud;
    icloud.load = async () => {
      throw new Error("iCloud signed out");
    };
    const adapter = createICloudAdapter("default");
    await expect(adapter.load()).resolves.toBeNull();
  });

  it("throws from save when the bridge has gone missing", async () => {
    const adapter = createICloudAdapter("default"); // no bridge installed
    await expect(adapter.save("{}")).rejects.toThrow(/not available/i);
  });

  it("delivers a remote change that names the watched key", async () => {
    const { store, fireChange } = installFakeICloud();
    const adapter = new ICloudStorageAdapter("default");
    const key = namespaceLocalKey("default");
    store.set(key, '{"remote":true}');

    const onRemote = vi.fn();
    const unsubscribe = adapter.watch(onRemote);
    fireChange([key]);
    await vi.waitFor(() => expect(onRemote).toHaveBeenCalledTimes(1));
    expect(onRemote).toHaveBeenCalledWith({ text: '{"remote":true}' });
    unsubscribe();
  });

  it("ignores a remote change that names only other keys", async () => {
    const { store, fireChange } = installFakeICloud();
    const adapter = new ICloudStorageAdapter("default");
    store.set(namespaceLocalKey("default"), "{}");

    const onRemote = vi.fn();
    adapter.watch(onRemote);
    fireChange([namespaceLocalKey("other")]);
    // Give any (unexpected) async re-read a tick to land.
    await Promise.resolve();
    expect(onRemote).not.toHaveBeenCalled();
  });

  it("re-reads when the platform names no changed keys", async () => {
    const { store, fireChange } = installFakeICloud();
    const adapter = new ICloudStorageAdapter("default");
    store.set(namespaceLocalKey("default"), '{"x":1}');

    const onRemote = vi.fn();
    adapter.watch(onRemote);
    fireChange(null);
    await vi.waitFor(() =>
      expect(onRemote).toHaveBeenCalledWith({ text: '{"x":1}' }),
    );
  });
});

describe("deleteICloudNamespace", () => {
  it("removes the namespace's key from the store", async () => {
    const { store, remove } = installFakeICloud();
    store.set(namespaceLocalKey("family"), "{}");
    await deleteICloudNamespace("family");
    expect(remove).toHaveBeenCalledWith(namespaceLocalKey("family"));
    expect(store.has(namespaceLocalKey("family"))).toBe(false);
  });

  it("is a no-op when no bridge is present", async () => {
    await expect(deleteICloudNamespace("family")).resolves.toBeUndefined();
  });
});
