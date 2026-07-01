// @vitest-environment jsdom
// Direct coverage for `useEncryption`, peeled out of `useStorageBackend` so the
// enable → re-wrap, disable → decrypt, and unlock → verify crypto round-trips
// are testable against a mocked `StorageAdapter` (and the persisted encryption
// mode) instead of the full storage hook. The mode is persisted in
// localStorage by `backend-preference`, so each test clears it and can seed the
// "encrypted on boot" state by persisting the mode before render.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  RateLimitError,
  type StorageAdapter,
  type StoredSnapshot,
} from "../../src/storage/adapter.ts";
import { setEncryption } from "../../src/storage/backend-preference.ts";
import { OfflineUnavailableError } from "../../src/storage/cache/index.ts";
import { encryptText, isEncryptedEnvelope } from "../../src/storage/crypto.ts";
import {
  type EncryptionProgressStep,
  useEncryption,
} from "../../src/storage/useEncryption.ts";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

/**
 * An in-memory `StorageAdapter` seeded with `initial` text. Records every save
 * so a test can assert the bytes that landed at rest; `load` can be made to
 * throw (the offline-with-no-cache case) via `failLoad`.
 */
function mockAdapter(
  initial: string | null = null,
  opts: {
    failLoad?: boolean;
    /**
     * Throw `RateLimitError` from `save` this many times before letting it
     * through, modelling a backend throttling the re-wrap. A very large value
     * (or `Infinity`) never lets a save land, so the retry budget is exhausted.
     */
    saveRateLimits?: number;
  } = {},
): {
  adapter: StorageAdapter;
  saves: string[];
  current: () => string | null;
  /** Arm the next N saves to throw `RateLimitError` (e.g. to throttle a later
   * disable without touching the enable that set the fixture up). */
  setSaveRateLimits: (n: number) => void;
} {
  let text = initial;
  const saves: string[] = [];
  let saveThrottlesLeft = opts.saveRateLimits ?? 0;
  return {
    saves,
    current: () => text,
    setSaveRateLimits: (n) => {
      saveThrottlesLeft = n;
    },
    adapter: {
      id: "browser",
      label: "Mock",
      capabilities: new Set(),
      async load(): Promise<StoredSnapshot | null> {
        if (opts.failLoad) throw new Error("offline");
        return text === null ? null : { text };
      },
      async save(next: string): Promise<StoredSnapshot> {
        if (saveThrottlesLeft > 0) {
          saveThrottlesLeft -= 1;
          // Tiny cooldown so the retry loop spins through fast in tests.
          throw new RateLimitError(1);
        }
        text = next;
        saves.push(next);
        return { text: next };
      },
    },
  };
}

describe("useEncryption", () => {
  it("starts plaintext: off, unlocked, no passphrase held", () => {
    const { adapter } = mockAdapter();
    const { result } = renderHook(() => useEncryption(adapter));
    expect(result.current.encryption).toBe("plaintext");
    expect(result.current.locked).toBe(false);
    expect(result.current.password).toBeNull();
  });

  it("enableEncryption rejects an empty passphrase", async () => {
    const { adapter } = mockAdapter("plain doc");
    const { result } = renderHook(() => useEncryption(adapter));
    await expect(
      act(async () => {
        await result.current.enableEncryption("");
      }),
    ).rejects.toThrow(/passphrase/i);
    expect(result.current.encryption).toBe("plaintext");
  });

  it("enableEncryption re-wraps existing plaintext into an envelope", async () => {
    const seed = mockAdapter("the plaintext document");
    const { result } = renderHook(() => useEncryption(seed.adapter));

    await act(async () => {
      await result.current.enableEncryption("hunter2");
    });

    expect(result.current.encryption).toBe("encrypted");
    expect(result.current.password).toBe("hunter2");
    expect(result.current.locked).toBe(false);
    // The bytes at rest are now an encrypted envelope, not the plaintext.
    const atRest = seed.current();
    expect(atRest).not.toBeNull();
    expect(isEncryptedEnvelope(atRest as string)).toBe(true);
  });

  it("enableEncryption on an empty store just flips the flag (no save)", async () => {
    const seed = mockAdapter(null);
    const { result } = renderHook(() => useEncryption(seed.adapter));

    await act(async () => {
      await result.current.enableEncryption("hunter2");
    });

    expect(result.current.encryption).toBe("encrypted");
    expect(result.current.password).toBe("hunter2");
    expect(seed.saves).toHaveLength(0);
  });

  it("enableEncryption reports reading → … → finalizing", async () => {
    const seed = mockAdapter("doc to wrap");
    const { result } = renderHook(() => useEncryption(seed.adapter));

    const steps: EncryptionProgressStep[] = [];
    await act(async () => {
      await result.current.enableEncryption("hunter2", (s) => steps.push(s));
    });

    expect(steps[0]).toBe("reading");
    expect(steps).toContain("encrypting");
    expect(steps).toContain("saving");
    expect(steps[steps.length - 1]).toBe("finalizing");
  });

  it("disableEncryption refuses while no passphrase is held", async () => {
    // Persist the encrypted mode before render so the hook boots locked.
    setEncryption("encrypted");
    const { adapter } = mockAdapter(await encryptText("doc", "hunter2"));
    const { result } = renderHook(() => useEncryption(adapter));
    expect(result.current.locked).toBe(true);

    await expect(
      act(async () => {
        await result.current.disableEncryption();
      }),
    ).rejects.toThrow(/unlock/i);
    expect(result.current.encryption).toBe("encrypted");
  });

  it("disableEncryption decrypts the envelope back to plaintext", async () => {
    const seed = mockAdapter("secret recipe");
    const { result } = renderHook(() => useEncryption(seed.adapter));
    await act(async () => {
      await result.current.enableEncryption("hunter2");
    });
    expect(isEncryptedEnvelope(seed.current() as string)).toBe(true);

    await act(async () => {
      await result.current.disableEncryption();
    });

    expect(result.current.encryption).toBe("plaintext");
    expect(result.current.password).toBeNull();
    expect(result.current.locked).toBe(false);
    // The document is readable plaintext again.
    expect(seed.current()).toBe("secret recipe");
  });

  it("unlock rejects an empty passphrase", async () => {
    setEncryption("encrypted");
    const { adapter } = mockAdapter(await encryptText("doc", "hunter2"));
    const { result } = renderHook(() => useEncryption(adapter));

    await expect(
      act(async () => {
        await result.current.unlock("");
      }),
    ).rejects.toThrow(/passphrase/i);
    expect(result.current.locked).toBe(true);
  });

  it("unlock with the right passphrase clears the locked gate", async () => {
    setEncryption("encrypted");
    const { adapter } = mockAdapter(await encryptText("doc", "hunter2"));
    const { result } = renderHook(() => useEncryption(adapter));
    expect(result.current.locked).toBe(true);

    await act(async () => {
      await result.current.unlock("hunter2");
    });

    expect(result.current.locked).toBe(false);
    expect(result.current.password).toBe("hunter2");
  });

  it("unlock with the wrong passphrase throws and stays locked", async () => {
    setEncryption("encrypted");
    const { adapter } = mockAdapter(await encryptText("doc", "hunter2"));
    const { result } = renderHook(() => useEncryption(adapter));

    await expect(
      act(async () => {
        await result.current.unlock("wrong-pass");
      }),
    ).rejects.toThrow();
    expect(result.current.locked).toBe(true);
    expect(result.current.password).toBeNull();
  });

  it("unlock maps an unreachable backend to OfflineUnavailableError", async () => {
    setEncryption("encrypted");
    const { adapter } = mockAdapter("ignored", { failLoad: true });
    const { result } = renderHook(() => useEncryption(adapter));

    await expect(
      act(async () => {
        await result.current.unlock("hunter2");
      }),
    ).rejects.toBeInstanceOf(OfflineUnavailableError);
    expect(result.current.locked).toBe(true);
  });

  it("unlock on plaintext-at-rest unlocks optimistically", async () => {
    // Mode says encrypted but the bytes are still plaintext (the re-wrap never
    // ran), so there's nothing to verify — any passphrase unlocks.
    setEncryption("encrypted");
    const { adapter } = mockAdapter("still plaintext");
    const { result } = renderHook(() => useEncryption(adapter));
    expect(result.current.locked).toBe(true);

    await act(async () => {
      await result.current.unlock("anything");
    });

    expect(result.current.locked).toBe(false);
    expect(result.current.password).toBe("anything");
  });

  it("disableEncryption rides out a rate limit and still decrypts", async () => {
    const seed = mockAdapter("secret recipe");
    const { result } = renderHook(() => useEncryption(seed.adapter));
    await act(async () => {
      await result.current.enableEncryption("hunter2");
    });
    expect(isEncryptedEnvelope(seed.current() as string)).toBe(true);

    // Two 429s on the plaintext write, then it lands. The re-wrap must ride
    // them out rather than aborting partway (which is what stranded the
    // document in the field).
    seed.setSaveRateLimits(2);
    const steps: EncryptionProgressStep[] = [];
    await act(async () => {
      await result.current.disableEncryption((s) => steps.push(s));
    });

    expect(result.current.encryption).toBe("plaintext");
    expect(result.current.password).toBeNull();
    // The document is readable plaintext again — nothing lost to the throttle.
    expect(seed.current()).toBe("secret recipe");
    // The UI was told it was waiting out the rate limit.
    expect(steps).toContain("throttled");
  });

  it("enableEncryption rides out a rate limit and still re-wraps", async () => {
    const seed = mockAdapter("the plaintext document", { saveRateLimits: 3 });
    const { result } = renderHook(() => useEncryption(seed.adapter));

    const steps: EncryptionProgressStep[] = [];
    await act(async () => {
      await result.current.enableEncryption("hunter2", (s) => steps.push(s));
    });

    expect(result.current.encryption).toBe("encrypted");
    expect(isEncryptedEnvelope(seed.current() as string)).toBe(true);
    expect(steps).toContain("throttled");
  });

  it("disableEncryption surfaces a persistent rate limit and stays encrypted", async () => {
    // A backend that never stops throttling exhausts the retry budget. The
    // toggle fails loudly, but crucially it stays encrypted with the passphrase
    // still held, so the intact ciphertext is recoverable rather than half-gone.
    setEncryption("encrypted");
    const seed = mockAdapter(await encryptText("secret recipe", "hunter2"));
    const { result } = renderHook(() => useEncryption(seed.adapter));
    await act(async () => {
      await result.current.unlock("hunter2");
    });
    seed.setSaveRateLimits(Infinity);

    await expect(
      act(async () => {
        await result.current.disableEncryption();
      }),
    ).rejects.toBeInstanceOf(RateLimitError);

    expect(result.current.encryption).toBe("encrypted");
    expect(result.current.password).toBe("hunter2");
    // The stored bytes are still the intact envelope, not a half-written doc.
    expect(isEncryptedEnvelope(seed.current() as string)).toBe(true);
  });
});
