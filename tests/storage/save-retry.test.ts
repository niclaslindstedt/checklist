import { describe, expect, it } from "vitest";

import {
  AuthError,
  ConflictError,
  RateLimitError,
} from "../../src/storage/adapter.ts";
import {
  backoffDelayMs,
  isRetryableSaveError,
  MAX_TRANSIENT_SAVE_RETRIES,
} from "../../src/storage/save-retry.ts";

describe("backoffDelayMs", () => {
  it("returns the equal-jitter window [cap/2, cap) for each attempt", () => {
    // rand=0 → exactly cap/2 (the floor); rand≈1 → just under cap.
    // attempt 0: cap = min(30000, 500) = 500 → [250, 500)
    expect(backoffDelayMs(0, {}, () => 0)).toBe(250);
    expect(backoffDelayMs(0, {}, () => 0.999999)).toBe(500);
    // attempt 1: cap = 1000 → [500, 1000)
    expect(backoffDelayMs(1, {}, () => 0)).toBe(500);
    // attempt 2: cap = 2000 → [1000, 2000)
    expect(backoffDelayMs(2, {}, () => 0)).toBe(1000);
  });

  it("grows the floor exponentially until it hits the ceiling", () => {
    const floors = [0, 1, 2, 3, 4, 5, 6, 7].map((n) =>
      backoffDelayMs(n, {}, () => 0),
    );
    // 250, 500, 1000, 2000, 4000, 8000, 15000 (capped), 15000 (capped)
    expect(floors).toEqual([250, 500, 1000, 2000, 4000, 8000, 15000, 15000]);
  });

  it("honours custom backoff options", () => {
    expect(backoffDelayMs(3, { baseMs: 100, factor: 3, maxMs: 1000 }, () => 0))
      // cap = min(1000, 100 * 3^3 = 2700) = 1000 → floor 500
      .toBe(500);
  });

  it("treats negative or fractional attempts as attempt 0", () => {
    expect(backoffDelayMs(-5, {}, () => 0)).toBe(250);
    expect(backoffDelayMs(0.9, {}, () => 0)).toBe(250);
  });
});

describe("isRetryableSaveError", () => {
  it("never retries the three typed adapter signals", () => {
    expect(isRetryableSaveError(new ConflictError({ text: "" }))).toBe(false);
    expect(isRetryableSaveError(new AuthError("expired"))).toBe(false);
    expect(isRetryableSaveError(new RateLimitError(1000))).toBe(false);
  });

  it("retries everything else — generic network / 5xx hiccups", () => {
    expect(isRetryableSaveError(new Error("503"))).toBe(true);
    expect(isRetryableSaveError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableSaveError("boom")).toBe(true);
    expect(isRetryableSaveError(undefined)).toBe(true);
  });
});

describe("MAX_TRANSIENT_SAVE_RETRIES", () => {
  it("is a small positive budget", () => {
    expect(MAX_TRANSIENT_SAVE_RETRIES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_TRANSIENT_SAVE_RETRIES)).toBe(true);
  });
});
