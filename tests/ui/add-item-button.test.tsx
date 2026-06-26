// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { AddItemButton } from "../../src/ui/AddItemButton.tsx";

// The hold must cross this threshold (see `LONG_PRESS_MS` in the component)
// before the bulk-action row fans out.
const LONG_PRESS_MS = 450;

function renderButton(over: Partial<Parameters<typeof AddItemButton>[0]> = {}) {
  const props = {
    onActivate: vi.fn(),
    onArchiveFinished: vi.fn(),
    onDeleteFinished: vi.fn(),
    finishedCount: 2,
    ...over,
  };
  render(<AddItemButton {...props} />);
  return props;
}

const plus = () => screen.getByLabelText("Add item");
const archive = () => screen.getByLabelText("Archive finished");
const del = () => screen.getByLabelText("Delete finished");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AddItemButton", () => {
  it("opens the composer on a plain tap", () => {
    const { onActivate } = renderButton();
    fireEvent.pointerDown(plus(), { pointerId: 1 });
    fireEvent.pointerUp(plus(), { pointerId: 1 });
    fireEvent.click(plus());
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("fans out the bulk actions on long-press", () => {
    vi.useFakeTimers();
    renderButton();
    fireEvent.pointerDown(plus(), { pointerId: 1 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(plus().getAttribute("aria-expanded")).toBe("true");
    expect((archive() as HTMLButtonElement).disabled).toBe(false);
  });

  // The bug: after the menu fans out under the finger, the *same* finger
  // lifting must not archive/delete. That pointerup ends the opening
  // long-press — it isn't a deliberate tap — so it (and the click trailing
  // it) is swallowed and the menu stays open.
  it("does not run a bulk action when the long-press finger lifts", () => {
    vi.useFakeTimers();
    const { onArchiveFinished } = renderButton();
    fireEvent.pointerDown(plus(), { pointerId: 7 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));

    // The finger comes up over the archive half-circle (capture was released,
    // so the pointerup lands there), then iOS fires the synthetic click.
    fireEvent.pointerUp(archive(), { pointerId: 7 });
    fireEvent.click(archive());

    expect(onArchiveFinished).not.toHaveBeenCalled();
    expect(plus().getAttribute("aria-expanded")).toBe("true");
  });

  it("runs the bulk action on a fresh, deliberate tap after opening", () => {
    vi.useFakeTimers();
    const { onArchiveFinished } = renderButton();
    fireEvent.pointerDown(plus(), { pointerId: 7 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    // Opening finger lifts — ignored.
    fireEvent.pointerUp(archive(), { pointerId: 7 });
    fireEvent.click(archive());
    // A separate tap (new pointer id) fires the action.
    fireEvent.pointerUp(archive(), { pointerId: 8 });
    expect(onArchiveFinished).toHaveBeenCalledTimes(1);
  });

  it("ignores the opening lift even when the finger is over delete", () => {
    vi.useFakeTimers();
    const { onDeleteFinished } = renderButton();
    fireEvent.pointerDown(plus(), { pointerId: 3 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    fireEvent.pointerUp(del(), { pointerId: 3 });
    fireEvent.click(del());
    expect(onDeleteFinished).not.toHaveBeenCalled();
  });

  it("does not fan out below the long-press threshold", () => {
    vi.useFakeTimers();
    const { onActivate } = renderButton();
    fireEvent.pointerDown(plus(), { pointerId: 1 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS - 50));
    fireEvent.pointerUp(plus(), { pointerId: 1 });
    fireEvent.click(plus());
    expect(plus().getAttribute("aria-expanded")).toBe("false");
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
