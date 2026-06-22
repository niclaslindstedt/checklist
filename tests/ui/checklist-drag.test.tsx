// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChecklistDragItem,
  ChecklistDragProvider,
} from "../../src/ui/checklist-drag.tsx";
import {
  CHECKLIST_DROP_ARCHIVE,
  CHECKLIST_DROP_ATTR,
  CHECKLIST_DROP_ROOT,
  checklistDropNamespaceKey,
} from "../../src/ui/checklist-drag-context.ts";
import { ReportDragActivityContext } from "../../src/ui/drag-activity.ts";

// jsdom implements neither pointer capture nor hit-testing; stub both so the
// long-press gesture can run. `elementFromPoint` is re-pointed per test.
beforeEach(() => {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  // jsdom doesn't implement hit-testing — define it so each test can spy it.
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
  }
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

function setup(onDrop: (id: string, key: string) => void) {
  const utils = render(
    <ChecklistDragProvider onDrop={onDrop}>
      <ChecklistDragItem checklistId="c1" title="My list" enabled>
        <button data-testid="list">My list</button>
      </ChecklistDragItem>
      <div data-testid="folder" {...{ [CHECKLIST_DROP_ATTR]: "f1" }}>
        Folder
      </div>
      <div
        data-testid="root"
        {...{ [CHECKLIST_DROP_ATTR]: CHECKLIST_DROP_ROOT }}
      >
        Ungrouped
      </div>
      <div
        data-testid="ns"
        {...{ [CHECKLIST_DROP_ATTR]: checklistDropNamespaceKey("work") }}
      >
        Work
      </div>
      <div
        data-testid="archive"
        {...{ [CHECKLIST_DROP_ATTR]: CHECKLIST_DROP_ARCHIVE }}
      >
        Archive
      </div>
    </ChecklistDragProvider>,
  );
  // The wrapper carrying the pointer handlers is the list button's parent.
  const wrapper = utils.getByTestId("list").parentElement!;
  return { ...utils, wrapper };
}

const touch = { pointerId: 1, pointerType: "touch", clientX: 10, clientY: 10 };

// Press-and-hold, then release over `target` — the gesture a touch user makes.
function dragOnto(wrapper: HTMLElement, target: HTMLElement) {
  vi.spyOn(document, "elementFromPoint").mockReturnValue(target);
  fireEvent.pointerDown(wrapper, touch);
  act(() => void vi.advanceTimersByTime(400));
  fireEvent.pointerMove(wrapper, { ...touch, clientX: 50, clientY: 200 });
  fireEvent.pointerUp(wrapper, { pointerId: 1 });
}

describe("checklist long-press drag", () => {
  it("reports the folder key when dropped on a folder", () => {
    const onDrop = vi.fn();
    const { wrapper, getByTestId } = setup(onDrop);
    dragOnto(wrapper, getByTestId("folder"));
    expect(onDrop).toHaveBeenCalledExactlyOnceWith("c1", "f1");
  });

  it("reports the root key when dropped on the ungrouped zone", () => {
    const onDrop = vi.fn();
    const { wrapper, getByTestId } = setup(onDrop);
    dragOnto(wrapper, getByTestId("root"));
    expect(onDrop).toHaveBeenCalledExactlyOnceWith("c1", CHECKLIST_DROP_ROOT);
  });

  it("reports the namespace key when dropped on a namespace row", () => {
    const onDrop = vi.fn();
    const { wrapper, getByTestId } = setup(onDrop);
    dragOnto(wrapper, getByTestId("ns"));
    expect(onDrop).toHaveBeenCalledExactlyOnceWith("c1", "ns:work");
  });

  it("reports the archive key when dropped on the Archive button", () => {
    const onDrop = vi.fn();
    const { wrapper, getByTestId } = setup(onDrop);
    dragOnto(wrapper, getByTestId("archive"));
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      "c1",
      CHECKLIST_DROP_ARCHIVE,
    );
  });

  it("positions the drag chip at the pickup point before the finger moves", () => {
    const onDrop = vi.fn();
    const { wrapper, container, getByTestId } = setup(onDrop);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(getByTestId("root"));

    fireEvent.pointerDown(wrapper, touch);
    // Latch the long-press; the chip mounts here, before any pointermove.
    act(() => void vi.advanceTimersByTime(400));

    const chip = container.querySelector<HTMLElement>("[aria-hidden]")!;
    // It must be placed at the fingertip immediately — not left at the
    // top-0/left-0 default until the first move snaps it into place.
    expect(chip.style.transform).toBe(
      "translate(10px, 10px) translate(-50%, -150%)",
    );
  });

  it("does not pick the list up if the finger moves before the press latches", () => {
    const onDrop = vi.fn();
    const { wrapper, getByTestId } = setup(onDrop);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      getByTestId("folder"),
    );

    fireEvent.pointerDown(wrapper, touch);
    // Travel past the slop before the timer fires → it's a scroll/swipe.
    fireEvent.pointerMove(wrapper, { ...touch, clientX: 10, clientY: 60 });
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.pointerUp(wrapper, { pointerId: 1 });

    expect(onDrop).not.toHaveBeenCalled();
  });

  it("ignores a mouse pointer (the desktop HTML5 path owns that)", () => {
    const onDrop = vi.fn();
    const { wrapper, getByTestId } = setup(onDrop);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      getByTestId("folder"),
    );

    fireEvent.pointerDown(wrapper, { ...touch, pointerType: "mouse" });
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.pointerUp(wrapper, { pointerId: 1 });

    expect(onDrop).not.toHaveBeenCalled();
  });

  // While a list is picked up, the drag must report itself so the
  // document-level pull-to-refresh stands down — dragging a list downward to a
  // drop target would otherwise arm a refresh at the same time.
  it("reports drag activity while a list is held, and clears it on drop", () => {
    const report = vi.fn();
    const { getByTestId } = render(
      <ReportDragActivityContext.Provider value={report}>
        <ChecklistDragProvider onDrop={() => {}}>
          <ChecklistDragItem checklistId="c1" title="My list" enabled>
            <button data-testid="list">My list</button>
          </ChecklistDragItem>
          <div
            data-testid="root"
            {...{ [CHECKLIST_DROP_ATTR]: CHECKLIST_DROP_ROOT }}
          >
            Ungrouped
          </div>
        </ChecklistDragProvider>
      </ReportDragActivityContext.Provider>,
    );
    const wrapper = getByTestId("list").parentElement!;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(getByTestId("root"));

    fireEvent.pointerDown(wrapper, touch);
    act(() => void vi.advanceTimersByTime(400));
    expect(report).toHaveBeenLastCalledWith(true);

    act(() => fireEvent.pointerUp(wrapper, { pointerId: 1 }));
    expect(report).toHaveBeenLastCalledWith(false);
  });
});
