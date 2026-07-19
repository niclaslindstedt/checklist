import { describe, expect, it, vi } from "vitest";

import type {
  StorageAdapter,
  StoredSnapshot,
} from "../../src/storage/adapter.ts";
import {
  type BackendFactoryDeps,
  type BackendSelection,
  createBackendFactory,
  wrapForEncryption,
} from "../../src/storage/backend-factory.ts";
import { isEncryptedEnvelope } from "../../src/storage/crypto.ts";

// In-memory inner adapter: holds the last-written bytes so the wrapped
// adapter can be exercised end-to-end without a real backend.
function memoryAdapter(initial: string | null = null): StorageAdapter & {
  raw(): string | null;
} {
  let stored = initial;
  return {
    id: "browser",
    label: "Memory",
    capabilities: new Set(["loadSync"]),
    loadSync() {
      return stored === null ? null : { text: stored };
    },
    async load(): Promise<StoredSnapshot | null> {
      return stored === null ? null : { text: stored };
    },
    async save(text: string): Promise<StoredSnapshot> {
      stored = text;
      return { text };
    },
    raw() {
      return stored;
    },
  };
}

describe("wrapForEncryption", () => {
  it("passes the adapter straight through when encryption is off", () => {
    const inner = memoryAdapter();
    expect(wrapForEncryption(inner, "plaintext", null)).toBe(inner);
    // A stray passphrase while plaintext still means no wrapping.
    expect(wrapForEncryption(inner, "plaintext", "pw")).toBe(inner);
  });

  it("passes through when encrypted but locked (no passphrase held)", () => {
    const inner = memoryAdapter();
    // locked === encrypted && password === null — never wrap without a key,
    // so the sealed bytes are only ever touched once a passphrase is supplied.
    expect(wrapForEncryption(inner, "encrypted", null)).toBe(inner);
  });

  it("wraps in the encryption envelope when encrypted and unlocked", async () => {
    const inner = memoryAdapter();
    const wrapped = wrapForEncryption(inner, "encrypted", "pw");
    expect(wrapped).not.toBe(inner);
    await wrapped.save('{"hello":"world"}');
    // The bytes that reach the inner backend are an envelope, not plaintext.
    expect(isEncryptedEnvelope(inner.raw()!)).toBe(true);
    expect(inner.raw()).not.toContain("hello");
    // …and loading back through the wrapper hands over the plaintext.
    const loaded = await wrapped.load();
    expect(loaded?.text).toBe('{"hello":"world"}');
  });

  it("drops the loadSync capability when it wraps (decryption is async)", () => {
    const inner = memoryAdapter();
    const wrapped = wrapForEncryption(inner, "encrypted", "pw");
    expect(wrapped.capabilities.has("loadSync")).toBe(false);
  });
});

// A throwaway in-memory `Storage` so the browser adapter and the cloud offline
// cache have somewhere to read/write without a real DOM.
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

function deps(over: Partial<BackendFactoryDeps> = {}): BackendFactoryDeps {
  return {
    fetchImpl: vi.fn() as unknown as typeof fetch,
    storage: fakeStorage(),
    onFolderPermissionLost: vi.fn(),
    ...over,
  };
}

describe("createBackendFactory", () => {
  it("builds a browser backend with no root stores", () => {
    const factory = createBackendFactory({ kind: "browser" }, deps());
    // The browser keeps settings and the namespace registry in localStorage,
    // so there's no separate root file store for either.
    expect(factory.settingsStore).toBeNull();
    expect(factory.namespaceStore).toBeNull();
    expect(factory.makeInner("work").id).toBe("browser");
  });

  it("builds a Dropbox backend with both root stores and a cached adapter", () => {
    const selection: BackendSelection = {
      kind: "dropbox",
      auth: {
        accessToken: "tok",
        refreshToken: null,
        onAccessTokenRefreshed: vi.fn(),
      },
    };
    const factory = createBackendFactory(selection, deps());
    expect(factory.settingsStore).not.toBeNull();
    expect(factory.namespaceStore).not.toBeNull();
    expect(factory.makeInner("work").id).toBe("dropbox");
  });

  it("builds a Google Drive backend with both root stores", () => {
    const factory = createBackendFactory(
      { kind: "gdrive", token: "tok" },
      deps(),
    );
    expect(factory.settingsStore).not.toBeNull();
    expect(factory.namespaceStore).not.toBeNull();
    expect(factory.makeInner("work").id).toBe("gdrive");
  });

  it("builds a folder backend, threading the permission callback through", () => {
    const onFolderPermissionLost = vi.fn();
    const handle = {} as FileSystemDirectoryHandle;
    const factory = createBackendFactory(
      { kind: "folder", handle },
      deps({ onFolderPermissionLost }),
    );
    expect(factory.settingsStore).not.toBeNull();
    expect(factory.namespaceStore).not.toBeNull();
    expect(factory.makeInner("work").id).toBe("folder");
  });

  it("builds an iCloud backend with no root stores (device-local like browser)", () => {
    // iCloud syncs only the per-namespace document; settings and the namespace
    // registry stay device-local (both stores null), matching the browser case.
    const factory = createBackendFactory({ kind: "icloud" }, deps());
    expect(factory.settingsStore).toBeNull();
    expect(factory.namespaceStore).toBeNull();
    expect(factory.makeInner("work").id).toBe("icloud");
  });

  it("scopes the document adapter to the slug it's asked for", () => {
    // makeInner is a factory, not a singleton: a cross-namespace move builds an
    // adapter for the target slug without disturbing the active one. Distinct
    // slugs get distinct adapter instances.
    const factory = createBackendFactory({ kind: "browser" }, deps());
    const a = factory.makeInner("work");
    const b = factory.makeInner("home");
    expect(a).not.toBe(b);
  });

  it("writes the browser adapter's bytes into the injected storage", async () => {
    const storage = fakeStorage();
    const factory = createBackendFactory(
      { kind: "browser" },
      deps({ storage }),
    );
    await factory.makeInner("work").save('{"v":1}');
    // The bytes land in the injected store, not a real localStorage.
    expect(storage.length).toBe(1);
  });
});
