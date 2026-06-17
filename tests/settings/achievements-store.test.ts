import { describe, expect, it } from "vitest";

import { defaultSettings, validateSettings } from "../../src/settings/store.ts";

// The achievement progress fields ride in the synced `Settings`, so the
// store's validator must round-trip and defensively coerce them.
describe("settings store — achievements", () => {
  it("defaults to an empty map and queue", () => {
    const s = defaultSettings();
    expect(s.achievements).toEqual({});
    expect(s.unseenAchievements).toEqual([]);
  });

  it("keeps a well-formed achievements map and unseen queue", () => {
    const out = validateSettings({
      achievements: { firstSteps: 1000, checkItOff: 2000 },
      unseenAchievements: ["checkItOff"],
    });
    expect(out.achievements).toEqual({ firstSteps: 1000, checkItOff: 2000 });
    expect(out.unseenAchievements).toEqual(["checkItOff"]);
  });

  it("drops non-numeric unlock timestamps", () => {
    const out = validateSettings({
      achievements: { a: 1, b: "nope", c: null, d: Infinity },
    });
    expect(out.achievements).toEqual({ a: 1 });
  });

  it("filters unseen ids that have no matching unlock", () => {
    const out = validateSettings({
      achievements: { firstSteps: 1 },
      unseenAchievements: ["firstSteps", "ghost", 42],
    });
    expect(out.unseenAchievements).toEqual(["firstSteps"]);
  });

  it("falls back to empty for malformed shapes", () => {
    const out = validateSettings({ achievements: "x", unseenAchievements: 7 });
    expect(out.achievements).toEqual({});
    expect(out.unseenAchievements).toEqual([]);
  });
});
