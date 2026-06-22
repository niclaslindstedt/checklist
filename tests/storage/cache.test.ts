import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AuthError,
  RateLimitError,
  type StorageAdapter,
  type StoredSnapshot,
} from "../../src/storage/adapter.ts";
import {
  OfflineUnavailableError,
  describeStorageError,
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

  it("does not treat a non-network error as offline (no false positive)", () => {
    // A plain Error (a 5xx surfaced generically, a parse failure) is the
    // backend erroring, not the network being down — must not read as offline.
    expect(isOfflineError(new Error("Drive list failed: 500"))).toBe(false);
  });

  it("ignores navigator.onLine, which false-reports offline on many setups", () => {
    // The unreliable flag must no longer turn an otherwise non-network error
    // into a spurious "you're offline" — the regression this change fixes.
    const original = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    try {
      expect(isOfflineError(new Error("backend hiccup"))).toBe(false);
    } finally {
      if (original) Object.defineProperty(navigator, "onLine", original);
    }
  });
});

describe("describeStorageError", () => {
  it("names the cryptic WebKit network error as a reachability failure", () => {
    // "Load failed" is what Safari/iOS throws for a dead network — opaque on
    // its own, so the phrase must spell out the meaning and keep the raw
    // wording for the record.
    const out = describeStorageError(new TypeError("Load failed"));
    expect(out).toBe(
      "backend unreachable — network request failed (Load failed)",
    );
  });

  it("names the Chromium network error the same way", () => {
    expect(describeStorageError(new TypeError("Failed to fetch"))).toBe(
      "backend unreachable — network request failed (Failed to fetch)",
    );
  });

  it("passes a descriptive backend error through verbatim", () => {
    // A 5xx surfaced generically already says what happened — don't dress it
    // up as a network outage.
    expect(describeStorageError(new Error("Dropbox upload failed: 503"))).toBe(
      "Dropbox upload failed: 503",
    );
  });

  it("stringifies a non-Error throw", () => {
    expect(describeStorageError("boom")).toBe("boom");
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

  it("serves the mirror synchronously for an instant first paint", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    inner.setLoad(async () => ({ text: '{"v":1}', revision: "r1" }));
    const cached = withLocalCache(inner, { storage, key });

    // Nothing mirrored yet — the sync fast path has nothing to hand back.
    expect(cached.capabilities.has("loadSync")).toBe(true);
    expect(cached.loadSync?.()).toBeNull();

    // After a live load primes the mirror, the next reload can read it
    // synchronously — bytes and revision, with no `offline` flag (the
    // live load that follows on mount settles connectivity).
    await cached.load();
    expect(cached.loadSync?.()).toEqual({ text: '{"v":1}', revision: "r1" });
    expect(cached.loadSync?.()?.offline).toBeUndefined();
  });

  it("drops the sync mirror once the remote goes empty", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    inner.setLoad(async () => ({ text: '{"v":1}', revision: "r1" }));
    const cached = withLocalCache(inner, { storage, key });
    await cached.load();
    expect(cached.loadSync?.()).not.toBeNull();

    inner.setLoad(async () => null);
    await cached.load();
    expect(cached.loadSync?.()).toBeNull();
  });

  it("forwards the reachability probe (and its capability) to the live backend", async () => {
    const storage = memoryStorage();
    const inner = scriptedAdapter();
    let probed = 0;
    const innerWithProbe: StorageAdapter = {
      ...inner,
      capabilities: new Set(["probe"]),
      probe: async () => {
        probed += 1;
        return true;
      },
    };
    const cached = withLocalCache(innerWithProbe, { storage, key });
    expect(cached.capabilities.has("probe")).toBe(true);
    expect(await cached.probe?.()).toBe(true);
    expect(probed).toBe(1);
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
