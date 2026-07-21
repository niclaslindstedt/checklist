// The module-level save guard the PWA update flow consults before
// reloading the page: producers of unsaved edits (the checklist sync
// engine) register here, and `settleSaves` flushes them and waits until
// nothing unsaved remains — or times out, in which case the caller must
// not tear the page down. The registry is a module singleton, so every
// test unregisters what it registered.
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hasUnsavedChanges,
  registerSaveGuard,
  settleSaves,
  SETTLE_POLL_MS,
} from "../../src/app/save-guard.ts";

const unregisters: Array<() => void> = [];

function register(guard: {
  hasUnsaved: () => boolean;
  flush: () => void;
}): void {
  unregisters.push(registerSaveGuard(guard));
}

afterEach(() => {
  while (unregisters.length > 0) unregisters.pop()!();
  vi.useRealTimers();
});

describe("save guard registry", () => {
  it("reports clean with no guards registered", () => {
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("reports unsaved while any guard does, clean after unregistering", () => {
    register({ hasUnsaved: () => false, flush: () => {} });
    const off = registerSaveGuard({ hasUnsaved: () => true, flush: () => {} });
    expect(hasUnsavedChanges()).toBe(true);
    off();
    expect(hasUnsavedChanges()).toBe(false);
  });
});

describe("settleSaves", () => {
  it("flushes every guard and resolves immediately when already clean", async () => {
    const flushA = vi.fn();
    const flushB = vi.fn();
    register({ hasUnsaved: () => false, flush: flushA });
    register({ hasUnsaved: () => false, flush: flushB });
    await expect(settleSaves(1000)).resolves.toBe(true);
    expect(flushA).toHaveBeenCalledTimes(1);
    expect(flushB).toHaveBeenCalledTimes(1);
  });

  it("waits for a guard to settle after its flush lands asynchronously", async () => {
    vi.useFakeTimers();
    // Models the debounced cloud save: flush starts the write, and the
    // guard only reports clean once the (async) save resolves.
    let unsaved = true;
    register({
      hasUnsaved: () => unsaved,
      flush: () => {
        setTimeout(() => {
          unsaved = false;
        }, SETTLE_POLL_MS * 3);
      },
    });
    const settled = settleSaves(SETTLE_POLL_MS * 50);
    await vi.advanceTimersByTimeAsync(SETTLE_POLL_MS * 4);
    await expect(settled).resolves.toBe(true);
  });

  it("resolves false when the guard never settles within the timeout", async () => {
    vi.useFakeTimers();
    register({ hasUnsaved: () => true, flush: () => {} });
    const settled = settleSaves(SETTLE_POLL_MS * 5);
    await vi.advanceTimersByTimeAsync(SETTLE_POLL_MS * 6);
    await expect(settled).resolves.toBe(false);
  });
});
