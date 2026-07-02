import { describe, expect, it } from "vitest";
import {
  findItem,
  flattenItems,
  mapTree,
  removeItem,
  updateItem,
  withChildren,
} from "../../src/domain/item-tree.ts";
import type { ChecklistItem } from "../../src/domain/types.ts";

const leaf = (
  id: string,
  extra: Partial<ChecklistItem> = {},
): ChecklistItem => ({
  id,
  title: id.toUpperCase(),
  checked: false,
  ...extra,
});

const parent = (
  id: string,
  children: ChecklistItem[],
  extra: Partial<ChecklistItem> = {},
): ChecklistItem => ({ ...leaf(id, extra), children });

describe("withChildren", () => {
  it("attaches a non-empty children list", () => {
    const item = leaf("a");
    const kids = [leaf("b")];
    const next = withChildren(item, kids);
    expect(next).not.toBe(item);
    expect(next.children).toBe(kids);
  });

  it("returns the same reference when children is already that array", () => {
    const kids = [leaf("b")];
    const item = parent("a", kids);
    expect(withChildren(item, kids)).toBe(item);
  });

  it("drops the children key entirely for an empty list so a leaf round-trips", () => {
    const item = parent("a", [leaf("b")]);
    const next = withChildren(item, []);
    expect("children" in next).toBe(false);
    expect(next).toEqual({ id: "a", title: "A", checked: false });
  });

  it("returns an already-leaf item untouched when given an empty list", () => {
    const item = leaf("a");
    expect(withChildren(item, [])).toBe(item);
  });
});

describe("flattenItems", () => {
  it("walks depth-first, parents before their children", () => {
    const tree = [
      parent("a", [leaf("a1"), parent("a2", [leaf("a2a")])]),
      leaf("b"),
    ];
    expect(flattenItems(tree).map((it) => it.id)).toEqual([
      "a",
      "a1",
      "a2",
      "a2a",
      "b",
    ]);
  });

  it("returns an empty array for an empty tree", () => {
    expect(flattenItems([])).toEqual([]);
  });
});

describe("findItem", () => {
  it("finds a nested item anywhere in the tree", () => {
    const target = leaf("deep");
    const tree = [parent("a", [parent("b", [target])])];
    expect(findItem(tree, "deep")).toBe(target);
  });

  it("returns undefined when the id is absent", () => {
    expect(findItem([leaf("a")], "z")).toBeUndefined();
  });
});

describe("updateItem", () => {
  it("applies the updater to a top-level match", () => {
    const items = [leaf("a"), leaf("b")];
    const next = updateItem(items, "a", (it) => ({ ...it, checked: true }));
    expect(next[0]!.checked).toBe(true);
    expect(next[1]).toBe(items[1]);
  });

  it("recurses into nested children, rebuilding only the touched branch", () => {
    const untouched = parent("b", [leaf("b1")]);
    const items = [parent("a", [leaf("a1")]), untouched];
    const next = updateItem(items, "a1", (it) => ({ ...it, checked: true }));
    expect(next[0]!.children![0]!.checked).toBe(true);
    expect(next[1]).toBe(untouched);
  });

  it("returns the same array reference when the id is absent", () => {
    const items = [parent("a", [leaf("a1")])];
    expect(
      updateItem(items, "missing", (it) => ({ ...it, checked: true })),
    ).toBe(items);
  });

  it("returns the same array reference when the updater is a no-op", () => {
    const items = [leaf("a")];
    expect(updateItem(items, "a", (it) => it)).toBe(items);
  });
});

describe("removeItem", () => {
  it("drops a top-level item and its whole subtree", () => {
    const items = [parent("a", [leaf("a1")]), leaf("b")];
    const next = removeItem(items, "a");
    expect(next.map((it) => it.id)).toEqual(["b"]);
  });

  it("drops a nested item, rebuilding its ancestors", () => {
    const items = [parent("a", [leaf("a1"), leaf("a2")])];
    const next = removeItem(items, "a1");
    expect(next[0]!.children!.map((it) => it.id)).toEqual(["a2"]);
  });

  it("drops the children key when removing an only child leaves a leaf", () => {
    const items = [parent("a", [leaf("a1")])];
    const next = removeItem(items, "a1");
    expect("children" in next[0]!).toBe(false);
  });

  it("returns the same array reference when the id is absent", () => {
    const items = [parent("a", [leaf("a1")])];
    expect(removeItem(items, "missing")).toBe(items);
  });
});

describe("mapTree", () => {
  it("applies the mapper to every node, depth-first", () => {
    const tree = [parent("a", [leaf("a1")]), leaf("b")];
    const marked = mapTree(tree, (it) => ({ ...it, checked: true }));
    expect(flattenItems(marked).every((it) => it.checked)).toBe(true);
  });

  it("keeps a mapped leaf a leaf (no empty children key added)", () => {
    const tree = [leaf("a")];
    const mapped = mapTree(tree, (it) => ({ ...it, title: "x" }));
    expect("children" in mapped[0]!).toBe(false);
  });
});
