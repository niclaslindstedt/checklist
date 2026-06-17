import { describe, expect, it } from "vitest";

import { ACHIEVEMENTS } from "../../src/achievements/catalog.ts";
import { deriveUnlocks } from "../../src/achievements/derive.ts";
import type { AchState } from "../../src/achievements/types.ts";
import { createChecklist } from "../../src/domain/checklists.ts";
import type { ChecklistItem, Snapshot } from "../../src/domain/types.ts";
import { defaultSettings } from "../../src/settings/store.ts";
import type { Settings } from "../../src/settings/types.ts";

// Build an AchState from a partial document + settings override. Keeps each
// case to the slice it exercises (budget's `baseState()` pattern).
function state(over: {
  items?: Partial<ChecklistItem>[];
  lists?: number;
  settings?: Partial<Settings>;
}): AchState {
  const lists = [];
  const count = over.lists ?? 1;
  for (let i = 0; i < count; i += 1) {
    const list = createChecklist(
      `list-${i}`,
      `List ${i}`,
      "2026-01-01T00:00:00.000Z",
    );
    if (i === 0 && over.items) {
      list.items = over.items.map((it, n) => ({
        id: `item-${n}`,
        title: it.title ?? `Item ${n}`,
        checked: it.checked ?? false,
        ...it,
      }));
    }
    lists.push(list);
  }
  const snapshot: Snapshot = { templates: [], checklists: lists };
  return { snapshot, settings: { ...defaultSettings(), ...over.settings } };
}

describe("deriveUnlocks", () => {
  it("fires firstSteps when the first item appears", () => {
    const prev = state({ items: [] });
    const next = state({ items: [{ title: "Buy milk" }] });
    expect(deriveUnlocks(prev, next, {})).toContain("firstSteps");
  });

  it("fires checkItOff when an item is first ticked", () => {
    const prev = state({ items: [{ title: "a", checked: false }] });
    const next = state({ items: [{ title: "a", checked: true }] });
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("checkItOff");
    // The item already existed, so firstSteps must NOT re-fire.
    expect(fresh).not.toContain("firstSteps");
  });

  it("fires noteToSelf, nonNegotiable, and archivist on their fields", () => {
    expect(
      deriveUnlocks(
        state({ items: [{ title: "a" }] }),
        state({ items: [{ title: "a", notes: "hi" }] }),
        {},
      ),
    ).toContain("noteToSelf");
    expect(
      deriveUnlocks(
        state({ items: [{ title: "a" }] }),
        state({ items: [{ title: "a", required: true }] }),
        {},
      ),
    ).toContain("nonNegotiable");
    expect(
      deriveUnlocks(
        state({ items: [{ title: "a" }] }),
        state({ items: [{ title: "a", archived: true }] }),
        {},
      ),
    ).toContain("archivist");
  });

  it("fires listMaker when a second checklist appears", () => {
    expect(
      deriveUnlocks(state({ lists: 1 }), state({ lists: 2 }), {}),
    ).toContain("listMaker");
  });

  it("fires the settings-derived achievements on their fields", () => {
    expect(
      deriveUnlocks(
        state({ settings: { theme: "dark" } }),
        state({ settings: { theme: "dracula" } }),
        {},
      ),
    ).toContain("interiorDesigner");
    expect(
      deriveUnlocks(
        state({ settings: { theme: "dark" } }),
        state({ settings: { theme: "custom" } }),
        {},
      ),
    ).toEqual(expect.arrayContaining(["interiorDesigner", "themeWizard"]));
    expect(
      deriveUnlocks(
        state({ settings: { fontScale: 1 } }),
        state({ settings: { fontScale: 1.25 } }),
        {},
      ),
    ).toContain("biggerPicture");
    expect(
      deriveUnlocks(
        state({ settings: { showMenuButton: true } }),
        state({ settings: { showMenuButton: false } }),
        {},
      ),
    ).toContain("minimalist");
  });

  it("never fires an already-unlocked achievement", () => {
    const prev = state({ items: [] });
    const next = state({ items: [{ title: "x" }] });
    expect(deriveUnlocks(prev, next, { firstSteps: 1 })).not.toContain(
      "firstSteps",
    );
  });

  it("skips snapshot predicates when only settings changed (slice pre-check)", () => {
    // Same snapshot reference on both sides: a settings-only delta must not
    // run the snapshot walks at all, so no snapshot achievement fires.
    const snapshot: Snapshot = {
      templates: [],
      checklists: [createChecklist("l", "L", "2026-01-01T00:00:00.000Z")],
    };
    const prev: AchState = { snapshot, settings: defaultSettings() };
    const next: AchState = {
      snapshot,
      settings: { ...defaultSettings(), theme: "monokai" },
    };
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toEqual(["interiorDesigner"]);
  });

  it("ignores a no-op transition", () => {
    const s = state({ items: [{ title: "a", checked: true }] });
    expect(deriveUnlocks(s, s, {})).toEqual([]);
  });

  it("fires completionist once every other achievement is unlocked", () => {
    const total = ACHIEVEMENTS.length - 1; // exclude completionist itself
    const map = (n: number): Record<string, number> => {
      const m: Record<string, number> = {};
      for (let i = 0; i < n; i += 1) m[`a${i}`] = 1;
      return m;
    };
    const prev = state({ settings: { achievements: map(total - 1) } });
    const next = state({ settings: { achievements: map(total) } });
    expect(deriveUnlocks(prev, next, next.settings.achievements)).toContain(
      "completionist",
    );
  });
});
