// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useUndoRedo } from "../../src/app/use-undo-redo.ts";
import type { Snapshot } from "../../src/domain/types.ts";

// A snapshot whose identity (the `name` tag) is easy to assert on.
function snap(tag: string): Snapshot {
  return {
    templates: [],
    checklists: [
      {
        version: 1,
        id: "list",
        templateId: "tpl",
        name: tag,
        items: [],
        createdAt: "t",
        updatedAt: "t",
      },
    ],
  };
}

const tagOf = (s: Snapshot): string => s.checklists[0]!.name;

// Mount the hook with a captured `setData` spy and a helper that records
// the latest snapshot pushed to it, mirroring how `useChecklist` feeds
// committed documents back into its own React state.
function mount(seed: Snapshot) {
  const applied: Snapshot[] = [];
  const view = renderHook(() =>
    useUndoRedo({ initialSeed: seed, setData: (s) => applied.push(s) }),
  );
  return { view, applied };
}

describe("useUndoRedo", () => {
  it("starts with nothing to undo or redo", () => {
    const { view } = mount(snap("a"));
    expect(view.result.current.canUndo).toBe(false);
    expect(view.result.current.canRedo).toBe(false);
  });

  it("undoes a recorded edit back to the prior snapshot", () => {
    const { view, applied } = mount(snap("a"));
    act(() => view.result.current.record(snap("b")));
    expect(view.result.current.canUndo).toBe(true);
    act(() => view.result.current.undo());
    expect(applied.map(tagOf)).toEqual(["a"]);
    expect(view.result.current.canUndo).toBe(false);
    expect(view.result.current.canRedo).toBe(true);
  });

  it("redoes back to the undone snapshot", () => {
    const { view, applied } = mount(snap("a"));
    act(() => view.result.current.record(snap("b")));
    act(() => view.result.current.undo());
    act(() => view.result.current.redo());
    expect(applied.map(tagOf)).toEqual(["a", "b"]);
    expect(view.result.current.canRedo).toBe(false);
  });

  it("restores a snapshot taken before a deletion (undo brings it back)", () => {
    const withItem = snap("a");
    withItem.checklists[0]!.items = [
      { id: "i1", title: "milk", checked: false, archived: false },
    ];
    const { view, applied } = mount(withItem);
    // User deletes the only item — the post-edit snapshot has none.
    act(() => view.result.current.record(snap("a")));
    act(() => view.result.current.undo());
    expect(applied[0]!.checklists[0]!.items).toHaveLength(1);
  });

  it("drops the redo branch when a new edit is recorded after an undo", () => {
    const { view } = mount(snap("a"));
    act(() => view.result.current.record(snap("b")));
    act(() => view.result.current.undo());
    expect(view.result.current.canRedo).toBe(true);
    act(() => view.result.current.record(snap("c")));
    expect(view.result.current.canRedo).toBe(false);
  });

  it("reset re-seeds the timeline and clears history", () => {
    const { view } = mount(snap("a"));
    act(() => view.result.current.record(snap("b")));
    act(() => view.result.current.reset(snap("z")));
    expect(view.result.current.canUndo).toBe(false);
    expect(view.result.current.canRedo).toBe(false);
  });

  it("is a no-op at the timeline edges", () => {
    const { applied, view } = mount(snap("a"));
    const undoSpy = vi.fn();
    act(() => view.result.current.undo());
    act(() => view.result.current.redo());
    expect(applied).toHaveLength(0);
    expect(undoSpy).not.toHaveBeenCalled();
  });
});
