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
});
