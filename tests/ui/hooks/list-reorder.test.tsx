// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { useListReorder } from "../../../src/ui/hooks/useListReorder.ts";

// Exercises the drag hook against a real (jsdom) list, with geometry faked so
// the collapse-on-lift behaviour can be observed: once a row is picked up it
// goes `position: absolute` (out of flow) and the rows below slide up to fill
// the gap. The hook must re-measure that collapsed layout — otherwise a middle
// row can't be dropped back into its own slot (the regression under test).

const H = 40; // every row is 40px tall

// Model CSS flow: a row's top is the running height of its in-flow, visible
// predecessors; an absolutely-positioned row (the lifted one) and any
// `display:none` row (a hidden subtree) are out of flow and contribute nothing.
function fakeRect(el: HTMLElement): DOMRect {
  const hidden = el.style.display === "none";
  let top = 0;
  let sib = el.previousElementSibling as HTMLElement | null;
  while (sib) {
    if (sib.style.display !== "none" && sib.style.position !== "absolute") {
      top += H;
    }
    sib = sib.previousElementSibling as HTMLElement | null;
  }
  const height = hidden ? 0 : H;
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

// The hook reports its live state through these probes so the test can read
// them out of the DOM after each gesture.
function Harness({
  onReorder = () => {},
}: {
  onReorder?: (id: string, targetId: string, mode: string) => void;
}) {
  const ctl = useListReorder(onReorder);
  return (
    <div>
      <ul ref={ctl.containerRef} style={{ position: "relative" }}>
        {["a", "b", "c", "d", "e"].map((id) => (
          <li
            key={id}
            data-reorder-id={id}
            data-testid={`row-${id}`}
            style={ctl.rowStyle(id)}
            {...ctl.dragHandleProps(id)}
          >
            {id}
          </li>
        ))}
      </ul>
      <div data-testid="dragging">{ctl.draggingId ?? "none"}</div>
      <div data-testid="drop">
        {ctl.dropTarget
          ? `${ctl.dropTarget.id}:${ctl.dropTarget.mode}`
          : "none"}
      </div>
      <button type="button" onClick={ctl.cancel}>
        cancel
      </button>
    </div>
  );
}

let releaseSpy: ReturnType<typeof vi.fn<(id: number) => void>>;

beforeEach(() => {
  // jsdom exposes no global `CSS`, pointer capture, or layout — stub each.
  if (!(globalThis as { CSS?: unknown }).CSS) {
    (globalThis as { CSS?: unknown }).CSS = {
      escape: (s: string) => s,
    };
  }
  releaseSpy = vi.fn();
  const captured = new Set<number>();
  HTMLElement.prototype.setPointerCapture = function (id: number) {
    captured.add(id);
  };
  HTMLElement.prototype.hasPointerCapture = function (id: number) {
    return captured.has(id);
  };
  HTMLElement.prototype.releasePointerCapture = function (id: number) {
    captured.delete(id);
    releaseSpy(id);
  };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return fakeRect(this);
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const drag = (id: string, clientY: number) =>
  fireEvent.pointerDown(screen.getByTestId(`row-${id}`), {
    pointerId: 1,
    clientY,
    button: 0,
    pointerType: "touch",
  });
const move = (id: string, clientY: number) =>
  fireEvent.pointerMove(screen.getByTestId(`row-${id}`), {
    pointerId: 1,
    clientY,
  });
// A mouse press on the grip. Unlike `drag` (touch), a desktop mouse has no
// implicit pointer capture, so the release can land anywhere.
const mouseDown = (id: string, clientY: number) =>
  fireEvent.pointerDown(screen.getByTestId(`row-${id}`), {
    pointerId: 1,
    clientY,
    button: 0,
    pointerType: "mouse",
  });
// Release / cancel fired on the document body rather than the grip, modelling a
// desktop release whose cursor drifted off the narrow grip button.
const upOffGrip = (clientY: number) =>
  fireEvent.pointerUp(document.body, { pointerId: 1, clientY });
const cancelOffGrip = () =>
  fireEvent.pointerCancel(document.body, { pointerId: 1 });

describe("useListReorder", () => {
  it("marks the picked-up row as dragging", () => {
    render(<Harness />);
    act(() => drag("c", 90)); // within c's slot (80..120)
    expect(screen.getByTestId("dragging").textContent).toBe("c");
  });

  it("lets a middle row drop back into its own slot after lifting out", () => {
    render(<Harness />);
    // Pick up c near the bottom of its slot (80..120); once lifted, d slides up
    // to fill 80..120. Pressing low leaves room to clear the 6px arm threshold.
    act(() => drag("c", 110));
    // Aim at the top edge of where the list now shows d — the original slot.
    act(() => move("c", 85));
    // Pre-fix this fell into the lifted row's stale rect and resolved to
    // "b:before", skipping the origin. Re-measuring the collapsed layout makes
    // it "d:before" — the row lands back where it started.
    expect(screen.getByTestId("drop").textContent).toBe("d:before");
  });

  it("resolves the bottom edge of the row above the origin to an after-drop", () => {
    render(<Harness />);
    act(() => drag("c", 90));
    act(() => move("c", 75)); // b's bottom edge (40..80)
    expect(screen.getByTestId("drop").textContent).toBe("b:after");
  });

  it("commits and unfreezes when a desktop mouse releases off the grip", () => {
    // The regression: the move/up handlers used to live only on the grip
    // button, and a mouse has no implicit capture, so a release that landed
    // anywhere else was never seen — `reset` never ran and the lifted row
    // (`position: absolute`) stayed frozen mid-air. Binding the release to
    // `window` catches it wherever the cursor ends up.
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    act(() => mouseDown("c", 90));
    act(() => move("c", 150)); // drag down over the lower rows
    expect(screen.getByTestId("dragging").textContent).toBe("c");

    act(() => upOffGrip(150)); // release with the cursor off the grip

    expect(screen.getByTestId("dragging").textContent).toBe("none");
    expect(screen.getByTestId("drop").textContent).toBe("none");
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]![0]).toBe("c");
  });

  it("aborts without committing when the browser cancels the pointer", () => {
    // A `pointercancel` (the UA seized the pointer for its own gesture) must
    // tear the drag down, not commit the half-finished move a release would.
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    act(() => mouseDown("c", 90));
    act(() => move("c", 150));
    expect(screen.getByTestId("dragging").textContent).toBe("c");

    act(() => cancelOffGrip());

    expect(screen.getByTestId("dragging").textContent).toBe("none");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("cancel() abandons the drag and releases the pointer capture", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    act(() => drag("c", 110));
    act(() => move("c", 85));
    expect(screen.getByTestId("dragging").textContent).toBe("c");
    expect(screen.getByTestId("drop").textContent).toBe("d:before");

    act(() => fireEvent.click(screen.getByText("cancel")));

    expect(screen.getByTestId("dragging").textContent).toBe("none");
    expect(screen.getByTestId("drop").textContent).toBe("none");
    expect(releaseSpy).toHaveBeenCalledWith(1);
    // A cancelled drag commits nothing.
    expect(onReorder).not.toHaveBeenCalled();
  });
});
