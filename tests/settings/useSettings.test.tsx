// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useSettings } from "../../src/settings/useSettings.ts";
import type { SettingsStore } from "../../src/storage/settings-store.ts";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// In-memory settings store standing in for a backend's root settings.json.
function memStore(initial: string | null = null): SettingsStore & {
  text: string | null;
} {
  return {
    text: initial,
    async load() {
      return this.text;
    },
    async save(text: string) {
      this.text = text;
    },
  };
}

describe("useSettings", () => {
  it("seeds an empty backend store from the local settings", async () => {
    const store = memStore(null);
    renderHook(() => useSettings(store));
    await waitFor(() => expect(store.text).not.toBeNull());
    expect(JSON.parse(store.text!).theme).toBeDefined();
  });

  it("adopts the backend store when it already holds settings", async () => {
    const store = memStore(JSON.stringify({ theme: "dracula" }));
    const { result } = renderHook(() => useSettings(store));
    await waitFor(() => expect(result.current.settings.theme).toBe("dracula"));
    // The adopted value is cached locally too (validated/normalised).
    expect(
      JSON.parse(localStorage.getItem("checklist:settings:v1")!).theme,
    ).toBe("dracula");
  });

  it("writes updates through to both localStorage and the backend store", async () => {
    const store = memStore(JSON.stringify({}));
    const { result } = renderHook(() => useSettings(store));
    await waitFor(() => expect(store.text).not.toBeNull());
    act(() => result.current.update("theme", "monokai"));
    expect(result.current.settings.theme).toBe("monokai");
    await waitFor(() => expect(JSON.parse(store.text!).theme).toBe("monokai"));
    expect(
      JSON.parse(localStorage.getItem("checklist:settings:v1")!).theme,
    ).toBe("monokai");
  });

  it("falls back to the localStorage cache when no backend store is given", () => {
    const { result } = renderHook(() => useSettings(null));
    act(() => result.current.update("fontScale", 1.25));
    expect(result.current.settings.fontScale).toBe(1.25);
    expect(
      JSON.parse(localStorage.getItem("checklist:settings:v1")!).fontScale,
    ).toBe(1.25);
  });

  it("commits a whole document through replace, preserving untouched fields", () => {
    const { result } = renderHook(() => useSettings(null));
    act(() => {
      result.current.unlockAchievements(["firstSteps"]);
    });
    // The settings dialog flushes its draft via `replace`; the producer can
    // keep the fields it doesn't own (here: the achievements map).
    act(() =>
      result.current.replace((prev) => ({
        ...prev,
        theme: "monokai",
        fontScale: 1.25,
      })),
    );
    expect(result.current.settings.theme).toBe("monokai");
    expect(result.current.settings.fontScale).toBe(1.25);
    expect(result.current.settings.achievements.firstSteps).toBeDefined();
    expect(
      JSON.parse(localStorage.getItem("checklist:settings:v1")!).theme,
    ).toBe("monokai");
  });

  it("records achievements idempotently and queues them as unseen", () => {
    const { result } = renderHook(() => useSettings(null));
    let fresh: string[] = [];
    act(() => {
      fresh = result.current.unlockAchievements(["firstSteps", "checkItOff"]);
    });
    expect(fresh).toEqual(["firstSteps", "checkItOff"]);
    expect(Object.keys(result.current.settings.achievements).sort()).toEqual([
      "checkItOff",
      "firstSteps",
    ]);
    expect(result.current.settings.unseenAchievements).toEqual([
      "firstSteps",
      "checkItOff",
    ]);

    // Re-recording one of them is a no-op: no new "fresh" id, no re-queue.
    let again: string[] = ["x"];
    act(() => {
      again = result.current.unlockAchievements(["firstSteps"]);
    });
    expect(again).toEqual([]);
    expect(result.current.settings.unseenAchievements).toEqual([
      "firstSteps",
      "checkItOff",
    ]);
  });

  it("clears the unseen queue without forgetting the unlocks", () => {
    const { result } = renderHook(() => useSettings(null));
    act(() => {
      result.current.unlockAchievements(["firstSteps"]);
    });
    act(() => result.current.clearUnseenAchievements());
    expect(result.current.settings.unseenAchievements).toEqual([]);
    expect(result.current.settings.achievements.firstSteps).toBeDefined();
  });
});
