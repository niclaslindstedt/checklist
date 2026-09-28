// @vitest-environment jsdom
// The presentation demo (`VITE_SEED=demo`, src/dev/demo.ts + demoData.ts):
// held to the app's own formats, to carrying nothing of the device but its
// look, to dates that never age, and to the premise of each App Store frame —
// for every day of a year as "now", each at a different hour of the day, so
// the frames hold whenever they're shot.

import { afterEach, describe, expect, it } from "vitest";

import { ACHIEVEMENT_BY_ID } from "../../src/achievements/catalog.ts";
import {
  DEMO,
  bootDemo,
  carriesOver,
  demoStorage,
} from "../../src/dev/demo.ts";
import {
  DEMO_ACHIEVEMENTS,
  DEMO_IDS,
  DEMO_NAMESPACES,
  WORK,
  buildDemo,
  demoTransforms,
  documentKey,
} from "../../src/dev/demoData.ts";
import {
  daysUntil,
  deadlineStatus,
  isHeldBack,
} from "../../src/domain/deadlines.ts";
import { isDone, progress } from "../../src/domain/item-display.ts";
import { dueRefreshes } from "../../src/domain/item-refresh.ts";
import { dueResets } from "../../src/domain/reset-schedule.ts";
import { applyTransforms } from "../../src/domain/transforms.ts";
import type {
  Checklist,
  ChecklistItem,
  Snapshot,
} from "../../src/domain/types.ts";
import { validateSettings } from "../../src/settings/store.ts";
import {
  namespaceLocalKey,
  parseNamespaces,
} from "../../src/storage/namespaces.ts";
import { parse, serialize } from "../../src/storage/serialize.ts";

const DAY = 86_400_000;
// The day the store's status bars were captured, at the bar's 9:41.
const SHOT = new Date(2026, 8, 26, 9, 41).getTime();

/** A year of moments frames could be shot at: one opening a day, the hour
 *  rotating with the day (00:41 on the first, 01:41 on the second, …), so
 *  across the year every hour of the day is walked on some fifteen days. */
const YEAR = Array.from({ length: 366 }, (_, i) => {
  const d = new Date(2026, 0, 1 + i, i % 24, 41);
  return d.getTime();
});

function home(now: number): Snapshot {
  return buildDemo(now).snapshots.default!;
}

function work(now: number): Snapshot {
  return buildDemo(now).snapshots[WORK]!;
}

function listIn(snapshot: Snapshot, id: string): Checklist {
  const list = snapshot.checklists.find((c) => c.id === id);
  if (!list) throw new Error(`no list ${id}`);
  return list;
}

function walk(items: ChecklistItem[]): ChecklistItem[] {
  return items.flatMap((i) => [i, ...walk(i.children ?? [])]);
}

function titled(list: Checklist, title: string): ChecklistItem {
  const item = walk(list.items).find((i) => i.title === title);
  if (!item) throw new Error(`no item ${title} in ${list.name}`);
  return item;
}

afterEach(() => {
  localStorage.clear();
});

describe("the demo switch", () => {
  it("is off in a build without VITE_SEED=demo", () => {
    expect(DEMO).toBe(false);
  });
});

describe("buildDemo — the app's own formats", () => {
  it("is deterministic for a moment", () => {
    expect(buildDemo(SHOT)).toEqual(buildDemo(SHOT));
  });

  it("stores each namespace's document where the browser backend reads it, as serialize writes it", () => {
    const demo = buildDemo(SHOT);
    for (const [slug, snapshot] of Object.entries(demo.snapshots)) {
      expect(documentKey(slug)).toBe(namespaceLocalKey(slug));
      const text = demo.storage[namespaceLocalKey(slug)]!;
      expect(text).toBe(serialize(snapshot));
      expect(parse(text)).toEqual(snapshot);
    }
  });

  it("registers its namespaces the way the registry parses them", () => {
    const raw = buildDemo(SHOT).storage["checklist:namespaces"]!;
    expect(parseNamespaces(raw)).toEqual(DEMO_NAMESPACES);
  });

  it("points every cursor at a list that exists, on the browser backend", () => {
    const demo = buildDemo(SHOT);
    expect(demo.storage["checklist:backend"]).toBe("browser");
    expect(listIn(home(SHOT), demo.storage["checklist:list:active:default"]!));
    expect(listIn(work(SHOT), demo.storage[`checklist:list:active:${WORK}`]!));
  });

  it("files every list in a folder that exists, and stamps each template from a list", () => {
    for (const snapshot of [home(SHOT), work(SHOT)]) {
      const folders = new Set((snapshot.folders ?? []).map((f) => f.id));
      const templates = new Set(snapshot.templates.map((t) => t.id));
      for (const list of snapshot.checklists) {
        if (list.folderId) expect(folders.has(list.folderId)).toBe(true);
        if (list.templateId) expect(templates.has(list.templateId)).toBe(true);
      }
      for (const t of snapshot.templates) {
        expect(walk(t.items).every((i) => !i.checked)).toBe(true);
      }
    }
  });

  it("keeps ids unique within each document", () => {
    for (const snapshot of [home(SHOT), work(SHOT)]) {
      const ids = [...snapshot.checklists, ...snapshot.templates].flatMap(
        (l) => [l.id, ...walk(l.items).map((i) => i.id)],
      );
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("writes titles that fit a phone row, and no filler", () => {
    for (const snapshot of [home(SHOT), work(SHOT)]) {
      for (const list of snapshot.checklists) {
        expect(list.name.length).toBeLessThanOrEqual(20);
        for (const item of walk(list.items)) {
          expect(item.title.length).toBeLessThanOrEqual(33);
          expect(item.title).not.toMatch(
            /^(test|item|task) ?\d*$|lorem|buy milk/i,
          );
        }
      }
    }
  });
});

describe("settings the demo brings", () => {
  it("passes the settings validator intact", () => {
    const settings = validateSettings({
      transforms: demoTransforms(),
      achievements: {},
    });
    expect(settings.transforms).toEqual(demoTransforms());
  });

  it("earns only achievements the catalog has, and none the demo can't have done", () => {
    for (const id of DEMO_ACHIEVEMENTS) {
      expect(ACHIEVEMENT_BY_ID.has(id)).toBe(true);
    }
    for (const id of [
      "cloudWalker",
      "icloudSync",
      "paranoidMode",
      "widgeteer",
    ]) {
      expect(DEMO_ACHIEVEMENTS).not.toContain(id);
    }
  });
});

describe("demoStorage — nothing of the device but its look", () => {
  function device(): Storage {
    localStorage.setItem(
      "checklist:v1",
      '{"version":2,"templates":[],"checklists":[]}',
    );
    localStorage.setItem("checklist:v1:family", "{}");
    localStorage.setItem(
      "checklist:namespaces",
      '[{"slug":"family","name":"Family"}]',
    );
    localStorage.setItem("checklist:backend", "dropbox");
    localStorage.setItem("checklist:dropbox:token", "secret");
    localStorage.setItem("checklist:encryption", "on");
    localStorage.setItem("checklist:list:active:default", "mine");
    localStorage.setItem(
      "checklist:settings:v1",
      JSON.stringify({
        theme: "dracula",
        fontScale: 1.25,
        transforms: { default: [{ id: "mine" }] },
        achievements: { firstSteps: 1 },
        unseenAchievements: ["firstSteps"],
      }),
    );
    localStorage.setItem("checklist:footer-collapsed", "true");
    return localStorage;
  }

  it("carries the look, the language and the footer, and nothing else", () => {
    expect(carriesOver("checklist:settings:v1")).toBe(true);
    expect(carriesOver("checklist:settings:language")).toBe(true);
    expect(carriesOver("checklist:footer-collapsed")).toBe(true);
    for (const key of [
      "checklist:v1",
      "checklist:v1:family",
      "checklist:namespaces",
      "checklist:namespace:active",
      "checklist:backend",
      "checklist:dropbox:token",
      "checklist:encryption",
      "checklist:list:active:default",
      "checklist:dev:mode",
    ]) {
      expect(carriesOver(key)).toBe(false);
    }
  });

  it("replaces the device's lists, cursors and backend with the demo's", () => {
    const memory = demoStorage(device(), SHOT);
    const demo = buildDemo(SHOT);
    for (const [key, value] of Object.entries(demo.storage)) {
      expect(memory.getItem(key)).toBe(value);
    }
    expect(memory.getItem("checklist:v1:family")).toBeNull();
    expect(memory.getItem("checklist:dropbox:token")).toBeNull();
    expect(memory.getItem("checklist:encryption")).toBeNull();
  });

  it("keeps the device's theme but brings its own rules and achievements", () => {
    const memory = demoStorage(device(), SHOT);
    const settings = JSON.parse(memory.getItem("checklist:settings:v1")!);
    expect(settings.theme).toBe("dracula");
    expect(settings.fontScale).toBe(1.25);
    expect(settings.transforms).toEqual(demoTransforms());
    expect(Object.keys(settings.achievements)).toEqual([...DEMO_ACHIEVEMENTS]);
    expect(settings.unseenAchievements).toBeUndefined();
    expect(memory.getItem("checklist:footer-collapsed")).toBe("true");
  });

  it("boots onto the demo and leaves the device's storage untouched", () => {
    const real = device();
    const before = real.getItem("checklist:v1");
    expect(bootDemo()).toBe(true);
    expect(window.localStorage).not.toBe(real);
    expect(window.localStorage.getItem("checklist:backend")).toBe("browser");
    window.localStorage.setItem("checklist:v1", "edited in the demo");
    expect(real.getItem("checklist:v1")).toBe(before);
    expect(real.getItem("checklist:backend")).toBe("dropbox");
    // Put the device's store back for the other tests.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => real,
    });
    expect(window.localStorage).toBe(real);
  });
});

describe("the frames' premises, on every day of a year", () => {
  it("walks every day of the year, and every hour of the day", () => {
    expect(new Date(YEAR[0]!).getFullYear()).toBe(2026);
    expect(new Date(YEAR[365]!).getFullYear()).toBe(2027);
    expect(new Set(YEAR.map((t) => new Date(t).getHours())).size).toBe(24);
  });

  it("frame 1: opening the app resets the weekly list, with its card, and nothing else", () => {
    for (const now of YEAR) {
      const iso = new Date(now).toISOString();
      const due = dueResets(home(now), iso);
      expect(due.map((d) => d.checklist.id)).toEqual([DEMO_IDS.weekly]);
      expect(due[0]!.checklist.resetSchedule?.popUp).toBe(true);
      expect(dueResets(work(now), iso)).toEqual([]);
      expect(dueRefreshes(home(now), iso)).toEqual([]);
      expect(dueRefreshes(work(now), iso)).toEqual([]);
    }
  });

  it("frame 1: the list behind the card is a pre-flight half done", () => {
    const ride = listIn(home(SHOT), DEMO_IDS.ride);
    expect(progress(ride, false)).toEqual({ checked: 5, total: 10 });
  });

  it("frame 2: the release is mid-run and its issue numbers are links", () => {
    const release = listIn(work(SHOT), DEMO_IDS.release);
    expect(release.templateId).toBe("tpl-release");
    const { checked, total } = progress(release, false);
    expect(checked).toBeGreaterThan(0);
    expect(checked).toBeLessThan(total);
    const segs = applyTransforms(
      "Close #482 and #497",
      demoTransforms()[WORK]!,
    );
    expect(segs.filter((s) => s.kind === "link").map((s) => s.text)).toEqual([
      "#482",
      "#497",
    ]);
    const masked = applyTransforms(
      titled(listIn(work(SHOT), DEMO_IDS.handover), "Bridge line 4417 902 318")
        .title,
      demoTransforms()[WORK]!,
    );
    expect(masked.some((s) => s.kind === "masked")).toBe(true);
  });

  it("frame 2: the release marks two steps required and is not done yet", () => {
    const release = listIn(work(SHOT), DEMO_IDS.release);
    const required = walk(release.items).filter((i) => i.required);
    expect(required.map((i) => [i.title, i.checked])).toEqual([
      ["Migrations tested on a prod copy", true],
      ["Canary at 5% for an hour", false],
    ]);
    expect(isDone(release)).toBe(false);
    // The template carries the flags into every run, unchecked.
    const tpl = work(SHOT).templates.find((t) => t.id === "tpl-release")!;
    expect(walk(tpl.items).filter((i) => i.required)).toHaveLength(2);
    // The laptop's required steps are checked: done in the sidebar.
    expect(isDone(listIn(work(SHOT), DEMO_IDS.laptop))).toBe(true);
  });

  it("frame 4: the upkeep list shows each timing, warming but never overdue", () => {
    for (const now of YEAR) {
      const iso = new Date(now).toISOString();
      const upkeep = listIn(home(now), DEMO_IDS.upkeep);
      const items = walk(upkeep.items).filter((i) => !i.archived);
      const statuses = items
        .filter((i) => i.deadline)
        .map((i) => deadlineStatus(i.deadline!, iso));
      expect(statuses).toContain("due-soon");
      expect(statuses).toContain("upcoming");
      expect(statuses).toContain("later");
      expect(statuses).not.toContain("overdue");
      expect(items.filter((i) => isHeldBack(i, iso))).toHaveLength(1);
      expect(items.filter((i) => i.recurrence).length).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("dates nothing in the past but what was done", () => {
    for (const now of [YEAR[0]!, SHOT, YEAR[365]!]) {
      const iso = new Date(now).toISOString();
      for (const snapshot of [home(now), work(now)]) {
        for (const list of snapshot.checklists) {
          for (const item of walk(list.items)) {
            if (item.deadline && !item.checked) {
              expect(daysUntil(item.deadline, iso)).toBeGreaterThanOrEqual(0);
            }
            if (item.checkedAt) {
              expect(new Date(item.checkedAt).getTime()).toBeLessThan(now);
              expect(now - new Date(item.checkedAt).getTime()).toBeLessThan(
                60 * DAY,
              );
            }
          }
        }
      }
    }
  });
});
