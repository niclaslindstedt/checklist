import { describe, expect, it } from "vitest";

import {
  decryptEnvelope,
  encryptText,
  isEncryptedEnvelope,
  parseEnvelope,
} from "../../src/storage/crypto.ts";

describe("encryptText / decryptEnvelope", () => {
  it("round-trips a UTF-8 plaintext", async () => {
    const plain = '{"version":1,"templates":[],"checklists":[]}';
    const envelope = await encryptText(plain, "correct horse battery staple");
    const back = await decryptEnvelope(
      envelope,
      "correct horse battery staple",
    );
    expect(back).toBe(plain);
  });

  it("round-trips non-ASCII text", async () => {
    const plain = "städlista — köp 🥛 · 🔐";
    const envelope = await encryptText(plain, "förälskelse-2026!");
    const back = await decryptEnvelope(envelope, "förälskelse-2026!");
    expect(back).toBe(plain);
  });

  it("produces a different ciphertext each call (random salt + iv)", async () => {
    const a = await encryptText("hello", "pw");
    const b = await encryptText("hello", "pw");
    expect(a).not.toBe(b);
    expect(await decryptEnvelope(a, "pw")).toBe("hello");
    expect(await decryptEnvelope(b, "pw")).toBe("hello");
  });

  it("rejects a wrong password", async () => {
    const envelope = await encryptText("secret", "right");
    await expect(decryptEnvelope(envelope, "wrong")).rejects.toThrow(
      /Wrong password/,
    );
  });

  it("rejects tampered ciphertext", async () => {
    const envelope = await encryptText("payload", "pw");
    const parsed = JSON.parse(envelope);
    parsed.ciphertext =
      parsed.ciphertext.slice(0, -2) +
      (parsed.ciphertext.slice(-2) === "AA" ? "BB" : "AA");
    await expect(decryptEnvelope(JSON.stringify(parsed), "pw")).rejects.toThrow(
      /Wrong password/,
    );
  });

  it("rejects an empty password on encrypt", async () => {
    await expect(encryptText("x", "")).rejects.toThrow(/Password is required/);
  });
});

describe("isEncryptedEnvelope / parseEnvelope", () => {
  it("recognizes a freshly produced envelope", async () => {
    const envelope = await encryptText("hi", "pw");
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    const parsed = parseEnvelope(envelope);
    expect(parsed?.encrypted).toBe("checklist.encrypted.v1");
    expect(parsed?.kdf).toBe("PBKDF2");
    expect(parsed?.iterations).toBeGreaterThanOrEqual(600_000);
  });

  it("rejects plain document JSON as not-an-envelope", () => {
    const plain = JSON.stringify({ version: 1, templates: [], checklists: [] });
    expect(isEncryptedEnvelope(plain)).toBe(false);
    expect(parseEnvelope(plain)).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(isEncryptedEnvelope("{not json")).toBe(false);
    expect(parseEnvelope("{not json")).toBeNull();
  });

  it("rejects an object with a foreign discriminator", () => {
    expect(
      isEncryptedEnvelope(JSON.stringify({ encrypted: "other.format.v1" })),
    ).toBe(false);
  });
});
