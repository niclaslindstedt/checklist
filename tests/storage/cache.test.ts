import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthError,
  RateLimitError,
  type StorageAdapter,
  type StoredSnapshot,
} from "../../src/storage/adapter.ts";
import {
  OfflineUnavailableError,
  isOfflineError,
  localCacheKey,
  withLocalCache,
} from "../../src/storage/cache/index.ts";

// A minimal in-memory `Storage` slice — the three methods the cache uses.
function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

// A scriptable inner adapter: `load` / `save` run whatever the test queues,
// so an "offline" turn can throw a raw network error (a TypeError, the way
// `fetch` rejects when it can't reach the host).
function scriptedAdapter(): StorageAdapter & {
  setLoad: (fn: () => Promise<StoredSnapshot | null>) => void;
  setSave: (fn: (text: string) => Promise<StoredSnapshot>) => void;
  saves: string[];
} {
  let loadImpl: () => Promise<StoredSnapshot | null> = async () => null;
  let saveImpl: (text: string) => Promise<StoredSnapshot> = async (text) => ({
    text,
    revision: "r1",
  });
  const saves: string[] = [];
  return {
    id: "dropbox",
    label: "Dropbox",
    capabilities: new Set(),
    load: () => loadImpl(),
    save: (text) => {
      saves.push(text);
      return saveImpl(text);
    },
    setLoad: (fn) => void (loadImpl = fn),
    setSave: (fn) => void (saveImpl = fn),
    saves,
  };
}

const offline = () => new TypeError("Failed to fetch");

afterEach(() => vi.restoreAllMocks());

describe("isOfflineError", () => {
  it("treats a raw network error as offline", () => {
    expect(isOfflineError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("never treats the typed adapter signals as offline", () => {
    expect(isOfflineError(new AuthError("401"))).toBe(false);
    expect(isOfflineError(new RateLimitError(1000))).toBe(false);
  });
});

describe("withLocalCache", () => {
  const key = localCacheKey("dropbox", "default");

  it("mirrors a successful load into the cache", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    inner.setLoad(async () => ({ text: '{"v":1}', revision: "r1" }));
    const cached = withLocalCache(inner, { storage, key });

    const loaded = await cached.load();
    expect(loaded?.text).toBe('{"v":1}');
    expect(loaded?.offline).toBeUndefined();
    expect(JSON.parse(storage.getItem(key)!)).toEqual({
      text: '{"v":1}',
      revision: "r1",
    });
  });

  it("serves the cached copy (flagged offline) when the backend is unreachable", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    inner.setLoad(async () => ({ text: '{"v":1}', revision: "r1" }));
    const cached = withLocalCache(inner, { storage, key });
    await cached.load(); // prime the cache while "online"

    inner.setLoad(async () => {
      throw offline();
    });
    const loaded = await cached.load();
    expect(loaded?.text).toBe('{"v":1}');
    expect(loaded?.revision).toBe("r1");
    expect(loaded?.offline).toBe(true);
  });

  it("re-throws when offline with nothing cached", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    inner.setLoad(async () => {
      throw offline();
    });
    const cached = withLocalCache(inner, { storage, key });
    await expect(cached.load()).rejects.toBeInstanceOf(TypeError);
  });

  it("re-throws a typed error instead of masking it with the cache", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    inner.setLoad(async () => ({ text: '{"v":1}', revision: "r1" }));
    const cached = withLocalCache(inner, { storage, key });
    await cached.load(); // prime the cache

    inner.setLoad(async () => {
      throw new AuthError("401");
    });
    await expect(cached.load()).rejects.toBeInstanceOf(AuthError);
  });

  it("clears a stale mirror when the remote is empty", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    inner.setLoad(async () => ({ text: '{"v":1}', revision: "r1" }));
    const cached = withLocalCache(inner, { storage, key });
    await cached.load();
    expect(storage.getItem(key)).not.toBeNull();

    inner.setLoad(async () => null);
    expect(await cached.load()).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("mirrors a successful save into the cache", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    inner.setSave(async (text) => ({ text, revision: "r2" }));
    const cached = withLocalCache(inner, { storage, key });

    await cached.save('{"v":2}');
    expect(JSON.parse(storage.getItem(key)!)).toEqual({
      text: '{"v":2}',
      revision: "r2",
    });
  });

  it("caches an offline save's bytes and re-throws so the engine retries", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    // Prime a revision via one good load so the offline save keeps the baseline.
    inner.setLoad(async () => ({ text: '{"v":1}', revision: "r1" }));
    const cached = withLocalCache(inner, { storage, key });
    await cached.load();

    inner.setSave(async () => {
      throw offline();
    });
    await expect(cached.save('{"v":2}')).rejects.toBeInstanceOf(TypeError);
    // The attempted bytes survive locally, on the last good revision, so an
    // offline reload keeps the edit and the reconnect save bases correctly.
    expect(JSON.parse(storage.getItem(key)!)).toEqual({
      text: '{"v":2}',
      revision: "r1",
    });
  });
});

describe("OfflineUnavailableError", () => {
  it("carries a stable name for instanceof branching at the unlock gate", () => {
    const err = new OfflineUnavailableError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("OfflineUnavailableError");
  });
});
