import { describe, expect, it } from "vitest";

import type {
  StorageAdapter,
  StoredSnapshot,
} from "../../src/storage/adapter.ts";
import { wrapForEncryption } from "../../src/storage/backend-factory.ts";
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
