import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  TIER_POINTS,
} from "../../src/achievements/index.ts";
import enAchievements from "../../src/i18n/locales/en/achievements.ts";
import svAchievements from "../../src/i18n/locales/sv/achievements.ts";

const SRC = join(import.meta.dirname, "..", "..", "src");

// Recursively collect every `unlock("id")` / `unlockAchievement("id")` call
// site under src/, so we can prove each manual achievement is actually wired
// (budget's "declared-but-unwired manual trigger" pitfall).
function wiredManualIds(): Set<string> {
  const ids = new Set<string>();
  const re = /\bunlock(?:Achievement)?\("([a-zA-Z0-9_]+)"\)/g;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        const text = readFileSync(full, "utf8");
        for (const m of text.matchAll(re)) {
          if (m[1]) ids.add(m[1]);
        }
      }
    }
  };
  walk(SRC);
  return ids;
}

describe("achievement catalog", () => {
  it("has unique ids and a by-id lookup covering every entry", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENT_BY_ID.size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(ACHIEVEMENT_BY_ID.get(a.id)).toBe(a);
  });

  it("places every achievement in one of the four point tiers", () => {
    for (const a of ACHIEVEMENTS) {
      expect(TIER_POINTS[a.tier]).toBeGreaterThan(0);
    }
  });

  it("wires every manual achievement to an unlock() call site", () => {
    const wired = wiredManualIds();
    const manual = ACHIEVEMENTS.filter((a) => a.trigger.kind === "manual");
    expect(manual.length).toBeGreaterThan(0);
    for (const a of manual) {
      expect(
        wired,
        `manual achievement "${a.id}" has no unlock() call`,
      ).toContain(a.id);
    }
  });

  it("carries an English name + condition for every id, and learnMore iff flagged", () => {
    const cat = enAchievements.catalog as Record<
      string,
      { name?: string; condition?: string; learnMore?: string }
    >;
    for (const a of ACHIEVEMENTS) {
      const entry = cat[a.id];
      expect(entry, `missing en catalog entry for "${a.id}"`).toBeTruthy();
      expect(entry?.name).toBeTruthy();
      expect(entry?.condition).toBeTruthy();
      expect(entry?.condition?.endsWith(".")).toBe(true);
      if (a.hasLearnMore) expect(entry?.learnMore).toBeTruthy();
      else expect(entry?.learnMore).toBeUndefined();
    }
  });

  it("mirrors every English catalog key in Swedish", () => {
    const en = enAchievements.catalog as Record<string, Record<string, string>>;
    const sv = svAchievements.catalog as Record<string, Record<string, string>>;
    for (const [id, enEntry] of Object.entries(en)) {
      const svEntry = sv[id];
      expect(svEntry, `missing sv catalog entry for "${id}"`).toBeTruthy();
      for (const key of Object.keys(enEntry)) {
        expect(svEntry?.[key], `sv ${id}.${key} missing`).toBeTruthy();
      }
    }
  });
});
