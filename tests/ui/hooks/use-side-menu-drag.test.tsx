// @vitest-environment jsdom
//
// Unit coverage for the sidebar checklist drag-to-move hook extracted out of
// `SideMenu`. The pure decision helpers (which kind is being dragged, which
// zones accept it, which zone is currently lit) are tested directly; the
// stateful handlers (`startChecklistDrag` / `allowDropOn` / `commitDrop` /
// `clearDropTarget`) are driven through `renderHook` with a faked drag event
// and the drag contexts the hook reads. The full touch-drag highlight wiring
// through the real `SideMenu` lives in `side-menu-drag-highlight.test.tsx`.
import { createElement, type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  CHECKLIST_DND_TYPE,
  deriveDragKind,
  dropAcceptsKind,
  isKeyDropTarget,
  useSideMenuDrag,
} from "../../../src/ui/hooks/useSideMenuDrag.ts";
import {
  CHECKLIST_DROP_ARCHIVE,
  CHECKLIST_DROP_ROOT,
  checklistDropNamespaceKey,
  folderDragId,
  DragAbortContext,
  DragKindContext,
  DropKeyContext,
  OnDropContext,
  type DragKind,
} from "../../../src/ui/checklist-drag-context.ts";

const NS_KEY = checklistDropNamespaceKey("work");

describe("deriveDragKind", () => {
  it("reads the desktop lift's kind off its drag id", () => {
    expect(deriveDragKind("c1", null)).toBe("checklist");
    expect(deriveDragKind(folderDragId("f1"), null)).toBe("folder");
  });

  it("falls back to the touch context kind when nothing is lifted on desktop", () => {
    expect(deriveDragKind(null, "folder")).toBe("folder");
    expect(deriveDragKind(null, null)).toBeNull();
  });
});

describe("dropAcceptsKind", () => {
  it("lets a checklist drag land anywhere", () => {
    expect(dropAcceptsKind(CHECKLIST_DROP_ROOT, "checklist")).toBe(true);
    expect(dropAcceptsKind(CHECKLIST_DROP_ARCHIVE, "checklist")).toBe(true);
    expect(dropAcceptsKind(NS_KEY, "checklist")).toBe(true);
  });

  it("restricts a folder drag to namespace rows only", () => {
    expect(dropAcceptsKind(NS_KEY, "folder")).toBe(true);
    expect(dropAcceptsKind(CHECKLIST_DROP_ROOT, "folder")).toBe(false);
    expect(dropAcceptsKind(CHECKLIST_DROP_ARCHIVE, "folder")).toBe(false);
    expect(dropAcceptsKind("f2", "folder")).toBe(false);
  });
});

describe("isKeyDropTarget", () => {
  it("lights the zone the desktop dragover is over when it accepts the drag", () => {
    expect(isKeyDropTarget("f1", "f1", null, "checklist")).toBe(true);
    expect(isKeyDropTarget("f1", "f2", null, "checklist")).toBe(false);
  });

  it("lights the zone the touch finger reports", () => {
    expect(isKeyDropTarget("f1", null, "f1", "checklist")).toBe(true);
  });

  it("never lights a zone the current drag can't land on", () => {
    expect(isKeyDropTarget(CHECKLIST_DROP_ROOT, CHECKLIST_DROP_ROOT, null, "folder")).toBe(
      false,
    );
    expect(isKeyDropTarget(NS_KEY, NS_KEY, null, "folder")).toBe(true);
  });
});

// A faked HTML5 drag event with a working dataTransfer and spies on the two
// propagation guards the handlers call.
function fakeDragEvent() {
  const store = new Map<string, string>();
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      setData: (type: string, val: string) => store.set(type, val),
      getData: (type: string) => store.get(type) ?? "",
      effectAllowed: "",
      dropEffect: "",
    },
  } as unknown as React.DragEvent;
}

function renderDragHook(opts?: {
  onDrop?: (id: string, key: string) => void;
  dropKey?: string | null;
  dragKind?: DragKind | null;
  abort?: number;
}) {
  const onDrop = opts?.onDrop ?? vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      OnDropContext.Provider,
      { value: onDrop },
      createElement(
        DropKeyContext.Provider,
        { value: opts?.dropKey ?? null },
        createElement(
          DragKindContext.Provider,
          { value: opts?.dragKind ?? null },
          createElement(
            DragAbortContext.Provider,
            { value: opts?.abort ?? 0 },
            children,
          ),
        ),
      ),
    );
  return { onDrop, ...renderHook(() => useSideMenuDrag(), { wrapper }) };
}

describe("useSideMenuDrag", () => {
  it("lifts a checklist on drag start and stamps the id onto the transfer", () => {
    const { result } = renderDragHook();
    const e = fakeDragEvent();
    act(() => result.current.startChecklistDrag(e, "c1"));

    expect(result.current.draggingChecklist).toBe("c1");
    expect(e.dataTransfer.getData(CHECKLIST_DND_TYPE)).toBe("c1");
    expect(e.dataTransfer.effectAllowed).toBe("move");
  });

  it("highlights an accepted zone on dragover and clears it on leave", () => {
    const { result } = renderDragHook();
    act(() => result.current.startChecklistDrag(fakeDragEvent(), "c1"));

    const over = fakeDragEvent();
    act(() => result.current.allowDropOn(over, "f1"));
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.stopPropagation).toHaveBeenCalled();
    expect(result.current.isDropTarget("f1")).toBe(true);

    act(() => result.current.clearDropTarget());
    expect(result.current.isDropTarget("f1")).toBe(false);
  });

  it("ignores a dragover when nothing is lifted", () => {
    const { result } = renderDragHook();
    const over = fakeDragEvent();
    act(() => result.current.allowDropOn(over, "f1"));
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(result.current.isDropTarget("f1")).toBe(false);
  });

  it("refuses to highlight a folder drag over a non-namespace zone", () => {
    const { result } = renderDragHook();
    act(() =>
      result.current.startChecklistDrag(fakeDragEvent(), folderDragId("f1")),
    );

    const over = fakeDragEvent();
    act(() => result.current.allowDropOn(over, CHECKLIST_DROP_ROOT));
    expect(over.preventDefault).not.toHaveBeenCalled();
    expect(result.current.isDropTarget(CHECKLIST_DROP_ROOT)).toBe(false);

    const overNs = fakeDragEvent();
    act(() => result.current.allowDropOn(overNs, NS_KEY));
    expect(overNs.preventDefault).toHaveBeenCalled();
    expect(result.current.isDropTarget(NS_KEY)).toBe(true);
  });

  it("resolves the dragged id through onDrop and ends the drag on commit", () => {
    const onDrop = vi.fn();
    const { result } = renderDragHook({ onDrop });
    act(() => result.current.startChecklistDrag(fakeDragEvent(), "c1"));

    const drop = fakeDragEvent();
    drop.dataTransfer.setData(CHECKLIST_DND_TYPE, "c1");
    act(() => result.current.commitDrop(drop, "f1"));

    expect(onDrop).toHaveBeenCalledWith("c1", "f1");
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(result.current.draggingChecklist).toBeNull();
  });

  it("clears the lift when the app raises the drag-abort signal", () => {
    // A mutable holder the wrapper re-reads on every render, so bumping it and
    // calling `rerender` re-runs the provider with the new abort generation.
    const holder = { abort: 0 };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        OnDropContext.Provider,
        { value: vi.fn() },
        createElement(
          DragAbortContext.Provider,
          { value: holder.abort },
          children,
        ),
      );
    const { result, rerender } = renderHook(() => useSideMenuDrag(), {
      wrapper,
    });
    act(() => result.current.startChecklistDrag(fakeDragEvent(), "c1"));
    expect(result.current.draggingChecklist).toBe("c1");

    holder.abort = 1;
    act(() => rerender());
    expect(result.current.draggingChecklist).toBeNull();
  });

  it("lights a zone the touch context reports under the finger", () => {
    const { result } = renderDragHook({ dropKey: "f1", dragKind: "checklist" });
    expect(result.current.isDropTarget("f1")).toBe(true);
  });
});
