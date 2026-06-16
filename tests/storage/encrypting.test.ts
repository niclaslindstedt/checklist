import { describe, expect, it } from "vitest";

import type {
  StorageAdapter,
  StoredSnapshot,
} from "../../src/storage/adapter.ts";
import { isEncryptedEnvelope } from "../../src/storage/crypto.ts";
import { withEncryption } from "../../src/storage/encrypting/index.ts";

// In-memory inner adapter: holds the last-written bytes so the encrypting
// wrapper can be exercised end-to-end without a real backend.
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

describe("withEncryption", () => {
  it("encrypts on save and decrypts on load (round-trip)", async () => {
    const inner = memoryAdapter();
    const enc = withEncryption(inner, { current: "pw" });
    await enc.save('{"hello":"world"}');
    // The bytes that hit the inner backend are an envelope, not plaintext.
    expect(isEncryptedEnvelope(inner.raw()!)).toBe(true);
    expect(inner.raw()).not.toContain("hello");
    // …but loading through the wrapper hands back the plaintext.
    const loaded = await enc.load();
    expect(loaded?.text).toBe('{"hello":"world"}');
  });

  it("drops the loadSync capability (decryption is async)", () => {
    const inner = memoryAdapter();
    const enc = withEncryption(inner, { current: "pw" });
    expect(enc.capabilities.has("loadSync")).toBe(false);
    expect(enc.loadSync).toBeUndefined();
  });

  it("passes plaintext-at-rest straight through (transitional)", async () => {
    const inner = memoryAdapter('{"plain":true}');
    const enc = withEncryption(inner, { current: "pw" });
    const loaded = await enc.load();
    expect(loaded?.text).toBe('{"plain":true}');
  });

  it("writes plaintext when no password is held", async () => {
    const inner = memoryAdapter();
    const enc = withEncryption(inner, { current: null });
    await enc.save('{"x":1}');
    expect(isEncryptedEnvelope(inner.raw()!)).toBe(false);
    expect(inner.raw()).toBe('{"x":1}');
  });

  it("throws on load when the bytes are encrypted but no password is held", async () => {
    const inner = memoryAdapter();
    await withEncryption(inner, { current: "pw" }).save('{"secret":1}');
    const locked = withEncryption(inner, { current: null });
    await expect(locked.load()).rejects.toThrow(/password is required/i);
  });

  it("throws on load with the wrong password", async () => {
    const inner = memoryAdapter();
    await withEncryption(inner, { current: "right" }).save('{"secret":1}');
    const wrong = withEncryption(inner, { current: "wrong" });
    await expect(wrong.load()).rejects.toThrow(/Wrong password/);
  });

  it("labels itself as encrypted and forwards getRevision", () => {
    const inner = memoryAdapter();
    const enc = withEncryption(inner, { current: "pw" });
    expect(enc.label).toContain("encrypted");
    expect(enc.getRevision).toBeUndefined();
  });
});
