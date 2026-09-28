// Required items: a task a list is not done without. It can be marked and
// unmarked, it may not leave the list while unchecked (alone or inside a
// subtree being archived), and a list whose required items are all checked
// is "done" — while a list with none keeps its plain count.
import { describe, expect, it } from "vitest";

import {
  archiveChecked,
  blocksArchive,
  createChecklist,
  findItem,
  isComplete,
  isDone,
  setRequired,
} from "../../src/domain/checklists.ts";
import type { Checklist, ChecklistItem } from "../../src/domain/types.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-02T00:00:00.000Z";

function list(items: ChecklistItem[]): Checklist {
  return { ...createChecklist("c1", "Trip", NOW), items };
}

describe("setRequired", () => {
  const base = list([{ id: "a", title: "Passport", checked: false }]);

  it("marks an item required and stamps the list", () => {
    const next = setRequired(base, "a", true, LATER);
    expect(findItem(next.items, "a")?.required).toBe(true);
    expect(next.updatedAt).toBe(LATER);
    expect(findItem(base.items, "a")?.required).toBeUndefined();
  });

  it("drops the flag rather than storing false", () => {
    const marked = setRequired(base, "a", true, LATER);
    const cleared = setRequired(marked, "a", false, LATER);
    expect("required" in findItem(cleared.items, "a")!).toBe(false);
  });

  it("returns the same list for a no-op or a missing id", () => {
    expect(setRequired(base, "a", false, LATER)).toBe(base);
    expect(setRequired(base, "missing", true, LATER)).toBe(base);
  });

  it("reaches a nested item", () => {
    const nested = list([
      {
        id: "p",
        title: "Bag",
        checked: false,
        children: [{ id: "k", title: "Keys", checked: false }],
      },
    ]);
    const next = setRequired(nested, "k", true, LATER);
    expect(findItem(next.items, "k")?.required).toBe(true);
  });
});

describe("blocksArchive", () => {
  it("blocks an unchecked required item", () => {
    expect(
      blocksArchive({ id: "a", title: "A", checked: false, required: true }),
    ).toBe(true);
  });

  it("lets a checked required item go", () => {
    expect(
      blocksArchive({ id: "a", title: "A", checked: true, required: true }),
    ).toBe(false);
  });

  it("lets an optional item go", () => {
    expect(blocksArchive({ id: "a", title: "A", checked: false })).toBe(false);
  });

  it("blocks a parent whose subtree holds an unchecked required item", () => {
    expect(
      blocksArchive({
        id: "p",
        title: "Bag",
        checked: true,
        children: [{ id: "k", title: "Keys", checked: false, required: true }],
      }),
    ).toBe(true);
  });

  it("ignores a required category header and an archived item", () => {
    expect(
      blocksArchive({
        id: "c",
        title: "Docs",
        checked: false,
        required: true,
        category: true,
      }),
    ).toBe(false);
    expect(
      blocksArchive({
        id: "a",
        title: "A",
        checked: false,
        required: true,
        archived: true,
      }),
    ).toBe(false);
  });
});

describe("archiveChecked with required items", () => {
  it("leaves a finished parent that still holds an unchecked required item", () => {
    const before = list([
      {
        id: "p",
        title: "Bag",
        checked: true,
        children: [{ id: "k", title: "Keys", checked: false, required: true }],
      },
      { id: "d", title: "Done", checked: true },
    ]);
    const after = archiveChecked(before, LATER);
    expect(findItem(after.items, "p")?.archived).toBeUndefined();
    expect(findItem(after.items, "d")?.archived).toBe(true);
  });
});

describe("isDone", () => {
  it("is never done with no required items, however much is checked", () => {
    const c = list([{ id: "a", title: "A", checked: true }]);
    expect(isComplete(c)).toBe(true);
    expect(isDone(c)).toBe(false);
  });

  it("waits for every required item, and only those", () => {
    const open = list([
      { id: "a", title: "Passport", checked: false, required: true },
      { id: "b", title: "Sunglasses", checked: false },
    ]);
    expect(isDone(open)).toBe(false);
    const checked = list([
      { id: "a", title: "Passport", checked: true, required: true },
      { id: "b", title: "Sunglasses", checked: false },
    ]);
    expect(isDone(checked)).toBe(true);
  });

  it("counts nested required items", () => {
    const c = list([
      {
        id: "p",
        title: "Bag",
        checked: true,
        children: [{ id: "k", title: "Keys", checked: false, required: true }],
      },
    ]);
    expect(isDone(c)).toBe(false);
  });

  it("ignores archived items and required category headers", () => {
    const c = list([
      { id: "a", title: "Passport", checked: true, required: true },
      {
        id: "x",
        title: "Old",
        checked: false,
        required: true,
        archived: true,
      },
      {
        id: "h",
        title: "Docs",
        checked: false,
        required: true,
        category: true,
      },
    ]);
    expect(isComplete(c)).toBe(true);
    expect(isDone(c)).toBe(true);
  });
});
