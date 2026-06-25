// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  useComposer,
  type ComposerOptions,
} from "../../../src/ui/hooks/useComposer.ts";
import type { DisplayRow } from "../../../src/domain/checklists.ts";

// A small flattened tree: a parent with two children, then a top-level
// sibling. Depths mirror what `flattenForDisplay` would produce.
//
//   0  p     (depth 0)
//   1  c1    (depth 1)  child of p
//   2  c2    (depth 1)  child of p
//   3  s     (depth 0)  sibling of p
const ROWS: DisplayRow[] = [
  { item: { id: "p", title: "P", checked: false }, depth: 0, hasChildren: true },
  { item: { id: "c1", title: "C1", checked: false }, depth: 1, hasChildren: false },
  { item: { id: "c2", title: "C2", checked: false }, depth: 1, hasChildren: false },
  { item: { id: "s", title: "S", checked: false }, depth: 0, hasChildren: false },
];

function makeOpts(overrides: Partial<ComposerOptions> = {}): ComposerOptions {
  return {
    rows: ROWS,
    addItemPosition: "bottom",
    addItem: vi.fn(() => "new"),
    addItemAfter: vi.fn(() => "new"),
    importItems: vi.fn(() => 1),
    importItemsAfter: vi.fn(() => ({ count: 1, lastId: "last" })),
    onEditBody: vi.fn(),
    revealItem: vi.fn(),
    ...overrides,
  };
}

function setup(overrides: Partial<ComposerOptions> = {}) {
  const opts = makeOpts(overrides);
  const hook = renderHook((o: ComposerOptions) => useComposer(o), {
    initialProps: opts,
  });
  return { ...hook, opts };
}

describe("useComposer", () => {
  it("starts closed with no active composer", () => {
    const { result } = setup();
    expect(result.current.kind).toBe("none");
    expect(result.current.active).toBeNull();
  });

  it("opens the inline composer past the last row at the bottom", () => {
    const { result } = setup({ addItemPosition: "bottom" });
    act(() => result.current.startInline());
    expect(result.current.active).toMatchObject({
      kind: "inline",
      spliceIndex: ROWS.length,
      depth: 0,
    });
  });

  it("anchors the inline composer above the list at the top", () => {
    const { result } = setup({ addItemPosition: "top" });
    act(() => result.current.startInline());
    expect(result.current.active).toMatchObject({ spliceIndex: 0 });
  });

  it("reveals the parent and splices a child composer past the subtree", () => {
    const revealItem = vi.fn();
    const { result } = setup({ revealItem, addItemPosition: "bottom" });
    act(() => result.current.startChild("p"));
    expect(revealItem).toHaveBeenCalledWith("p");
    // Bottom add-position lands the child past p's whole subtree (index 3),
    // at the parent's depth + 1.
    expect(result.current.active).toMatchObject({
      kind: "child",
      spliceIndex: 3,
      depth: 1,
    });
  });

  it("splices a child composer right under the parent at the top position", () => {
    const { result } = setup({ addItemPosition: "top" });
    act(() => result.current.startChild("p"));
    // Top add-position sits the composer immediately after the parent (index 1),
    // before its existing children.
    expect(result.current.active).toMatchObject({ spliceIndex: 1, depth: 1 });
  });

  it("splices an after-an-item composer past the anchor's subtree at its own depth", () => {
    const { result } = setup();
    act(() => result.current.startAfter("p"));
    // After p's subtree (c1, c2) → index 3, at p's own depth (0).
    expect(result.current.active).toMatchObject({
      kind: "after",
      spliceIndex: 3,
      depth: 0,
    });
  });

  it("treats the three composers as mutually exclusive", () => {
    const { result } = setup();
    act(() => result.current.startChild("p"));
    expect(result.current.kind).toBe("child");
    // Opening another replaces the first — only one is ever live.
    act(() => result.current.startAfter("s"));
    expect(result.current.kind).toBe("after");
    act(() => result.current.startInline());
    expect(result.current.kind).toBe("inline");
    act(() => result.current.close());
    expect(result.current.kind).toBe("none");
    expect(result.current.active).toBeNull();
  });

  it("advances the after-composer's anchor to each newly added item", () => {
    const addItemAfter = vi.fn(() => "added");
    const { result } = setup({ addItemAfter });
    act(() => result.current.startAfter("p"));
    act(() => result.current.active!.onAdd("Sub"));
    expect(addItemAfter).toHaveBeenCalledWith("Sub", "p");
    // The new item becomes the anchor so the next add chains below it; with
    // the new id absent from ROWS, the splice falls back to -1.
    expect(result.current.active).toMatchObject({ kind: "after" });
    act(() => result.current.active!.onAdd("Sub2"));
    expect(addItemAfter).toHaveBeenLastCalledWith("Sub2", "added");
  });

  it("advances the anchor past a pasted block to the importer's last id", () => {
    const importItemsAfter = vi.fn(() => ({ count: 3, lastId: "tail" }));
    const addItemAfter = vi.fn(() => "z");
    const { result } = setup({ importItemsAfter, addItemAfter });
    act(() => result.current.startAfter("p"));
    let count = 0;
    act(() => {
      count = result.current.active!.onImport("- [ ] a\n- [ ] b\n- [ ] c");
    });
    expect(count).toBe(3);
    // A typed follow-up now chains below the pasted block's tail, not above it.
    act(() => result.current.active!.onAdd("After paste"));
    expect(addItemAfter).toHaveBeenCalledWith("After paste", "tail");
  });

  it("opens the new item's body and closes on a with-body add", () => {
    const onEditBody = vi.fn();
    const addItem = vi.fn(() => "child-id");
    const { result } = setup({ onEditBody, addItem });
    act(() => result.current.startChild("p"));
    act(() => result.current.active!.onAddWithBody("Note me"));
    expect(addItem).toHaveBeenCalledWith("Note me", "p");
    expect(onEditBody).toHaveBeenCalledWith("child-id");
    // The composer closes — focus moves to the new row's body field.
    expect(result.current.kind).toBe("none");
  });

  it("does not open a body editor when the add is rejected (blank title)", () => {
    const onEditBody = vi.fn();
    const addItem = vi.fn(() => null);
    const { result } = setup({ onEditBody, addItem });
    act(() => result.current.startInline());
    act(() => result.current.active!.onAddWithBody(""));
    expect(onEditBody).not.toHaveBeenCalled();
    // It still closes the composer regardless.
    expect(result.current.kind).toBe("none");
  });

  it("reports -1 when the child composer's parent is no longer in the rows", () => {
    const { result } = setup();
    act(() => result.current.startChild("gone"));
    // A missing anchor can't be spliced; -1 keeps it from rendering anywhere.
    expect(result.current.active).toMatchObject({ spliceIndex: -1, depth: 0 });
  });
});
