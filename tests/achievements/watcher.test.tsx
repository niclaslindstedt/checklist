// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { resetBus } from "../../src/achievements/bus.ts";
import { unlock } from "../../src/achievements/index.ts";
import { useAchievementWatcher } from "../../src/achievements/useAchievementWatcher.ts";
import { createChecklist } from "../../src/domain/checklists.ts";
import { addItem } from "../../src/domain/checklists.ts";
import type { Snapshot } from "../../src/domain/types.ts";
import { defaultSettings } from "../../src/settings/store.ts";
import type { Settings } from "../../src/settings/types.ts";

afterEach(() => resetBus());

const ISO = "2026-01-01T00:00:00.000Z";

function snapWith(...titles: string[]): Snapshot {
  let list = createChecklist("l", "L", ISO);
  for (const [i, title] of titles.entries()) {
    list = addItem(list, { id: `i${i}`, title }, ISO, "bottom");
  }
  return { templates: [], checklists: [list] };
}

// A stand-in for `useSettings().unlockAchievements`: dedupes against a live
// map and returns the genuinely-new ids, mutating `settings` in place so the
// next render sees the recorded unlocks.
function makeRecorder(settings: Settings) {
  return (ids: readonly string[]): string[] => {
    const fresh = ids.filter((id) => settings.achievements[id] === undefined);
    for (const id of fresh) settings.achievements[id] = 1;
    return fresh;
  };
}

describe("useAchievementWatcher", () => {
  it("does not backfill unlocks when a saved document loads", () => {
    const settings = defaultSettings();
    const unlocked: string[] = [];
    const props = {
      snapshot: snapWith(), // seed: empty
      settings,
      loaded: false,
      enabled: true,
      record: makeRecorder(settings),
      onUnlocked: (ids: string[]) => unlocked.push(...ids),
    };
    const { rerender } = renderHook((p) => useAchievementWatcher(p), {
      initialProps: props,
    });
    // The backend load swaps in a document that already has a checked item
    // AND flips `loaded` true in one go — must NOT fire firstSteps/checkItOff.
    const loadedSnap = snapWith("done");
    loadedSnap.checklists[0]!.items[0]!.checked = true;
    act(() => {
      rerender({ ...props, snapshot: loadedSnap, loaded: true });
    });
    expect(unlocked).toEqual([]);
    expect(settings.achievements).toEqual({});
  });

  it("fires derived unlocks for edits made after load", () => {
    const settings = defaultSettings();
    const unlocked: string[] = [];
    const base = {
      settings,
      loaded: true as boolean,
      enabled: true as boolean,
      record: makeRecorder(settings),
      onUnlocked: (ids: string[]) => unlocked.push(...ids),
    };
    const { rerender } = renderHook((p) => useAchievementWatcher(p), {
      initialProps: { ...base, snapshot: snapWith() },
    });
    // First loaded render is the baseline; the user then adds an item.
    act(() => rerender({ ...base, snapshot: snapWith("milk") }));
    expect(unlocked).toContain("firstSteps");
    expect(settings.achievements.firstSteps).toBeDefined();
  });

  it("drains a manual unlock from the bus once loaded", () => {
    const settings = defaultSettings();
    const unlocked: string[] = [];
    const props = {
      snapshot: snapWith(),
      settings,
      loaded: true as boolean,
      enabled: true as boolean,
      record: makeRecorder(settings),
      onUnlocked: (ids: string[]) => unlocked.push(...ids),
    };
    renderHook((p) => useAchievementWatcher(p), { initialProps: props });
    act(() => unlock("copyThat"));
    expect(unlocked).toContain("copyThat");
    expect(settings.achievements.copyThat).toBeDefined();
  });

  it("records nothing while disabled — derived edits and manual unlocks", () => {
    const settings = defaultSettings();
    const unlocked: string[] = [];
    const base = {
      settings,
      loaded: true as boolean,
      enabled: false as boolean,
      record: makeRecorder(settings),
      onUnlocked: (ids: string[]) => unlocked.push(...ids),
    };
    const { rerender } = renderHook((p) => useAchievementWatcher(p), {
      initialProps: { ...base, snapshot: snapWith() },
    });
    // A derived-trigger edit (adding the first item) must not unlock while off.
    act(() => rerender({ ...base, snapshot: snapWith("milk") }));
    // A manual unlock fired while off must be discarded, not queued for later.
    act(() => unlock("copyThat"));
    expect(unlocked).toEqual([]);
    expect(settings.achievements).toEqual({});
  });

  it("resumes forward-going on re-enable without backfilling the disabled gap", () => {
    const settings = defaultSettings();
    const unlocked: string[] = [];
    const base = {
      settings,
      loaded: true as boolean,
      record: makeRecorder(settings),
      onUnlocked: (ids: string[]) => unlocked.push(...ids),
    };
    const { rerender } = renderHook((p) => useAchievementWatcher(p), {
      initialProps: { ...base, enabled: false, snapshot: snapWith() },
    });
    // While disabled the user adds an item — no unlock.
    act(() =>
      rerender({ ...base, enabled: false, snapshot: snapWith("milk") }),
    );
    expect(unlocked).toEqual([]);
    // Re-enabling only re-baselines: the existing item is "what they had", so
    // firstSteps must NOT backfill from the gap.
    act(() => rerender({ ...base, enabled: true, snapshot: snapWith("milk") }));
    expect(unlocked).toEqual([]);
    expect(settings.achievements).toEqual({});
    // A gesture made after re-enabling counts as usual.
    act(() => unlock("copyThat"));
    expect(unlocked).toContain("copyThat");
    expect(settings.achievements.copyThat).toBeDefined();
  });
});
