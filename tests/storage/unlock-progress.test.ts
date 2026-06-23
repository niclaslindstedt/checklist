// @vitest-environment jsdom
// Coverage for the progress callback `useStorageBackend.unlock` now threads
// through, so the unlock gate can flash a status line while the passphrase is
// checked and the document decrypts. Drives the hook on the browser backend:
// encrypt the store, then unlock it and record the phases reported.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createChecklist } from "../../src/domain/checklists.ts";
import { emptySnapshot } from "../../src/domain/types.ts";
import { BrowserLocalStorageAdapter } from "../../src/storage/local/index.ts";
import { DEFAULT_NAMESPACE_SLUG } from "../../src/storage/namespaces.ts";
import { serialize } from "../../src/storage/serialize.ts";
import type { EncryptionProgressStep } from "../../src/storage/useStorageBackend.ts";
import { useStorageBackend } from "../../src/storage/useStorageBackend.ts";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useStorageBackend.unlock progress", () => {
  it("reports reading → derivingKey → decrypting → finalizing", async () => {
    // Seed a non-empty plaintext document so enabling encryption actually
    // re-wraps it — a fresh, empty store would skip the cipher entirely.
    await new BrowserLocalStorageAdapter(
      localStorage,
      DEFAULT_NAMESPACE_SLUG,
    ).save(
      serialize({
        ...emptySnapshot(),
        checklists: [
          createChecklist("c1", "Recipes", "2026-01-01T00:00:00.000Z"),
        ],
      }),
    );

    const { result } = renderHook(() => useStorageBackend());
    await act(async () => {});

    // Encrypt the store so the envelope at rest needs decrypting on unlock.
    await act(async () => {
      await result.current.enableEncryption("hunter2");
    });

    const steps: EncryptionProgressStep[] = [];
    await act(async () => {
      await result.current.unlock("hunter2", (s) => steps.push(s));
    });

    expect(steps[0]).toBe("reading");
    expect(steps).toContain("derivingKey");
    expect(steps).toContain("decrypting");
    expect(steps[steps.length - 1]).toBe("finalizing");
  });
});
