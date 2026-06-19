// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useUndoRedoShortcuts } from "../../../src/ui/hooks/useUndoRedoShortcuts.ts";

function pressUndo() {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

function pressRedo() {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useUndoRedoShortcuts", () => {
  it("fires undo on Ctrl+Z", () => {
    const onUndo = vi.fn();
    renderHook(() =>
      useUndoRedoShortcuts({
        canUndo: true,
        canRedo: true,
        onUndo,
        onRedo: vi.fn(),
      }),
    );
    act(() => pressUndo());
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("fires redo on Ctrl+Shift+Z", () => {
    const onRedo = vi.fn();
    renderHook(() =>
      useUndoRedoShortcuts({
        canUndo: true,
        canRedo: true,
        onUndo: vi.fn(),
        onRedo,
      }),
    );
    act(() => pressRedo());
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled (side menu open)", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    renderHook(() =>
      useUndoRedoShortcuts({
        canUndo: true,
        canRedo: true,
        onUndo,
        onRedo,
        enabled: false,
      }),
    );
    act(() => pressUndo());
    act(() => pressRedo());
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it("re-arms when re-enabled (side menu closes)", () => {
    const onUndo = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) =>
        useUndoRedoShortcuts({
          canUndo: true,
          canRedo: true,
          onUndo,
          onRedo: vi.fn(),
          enabled,
        }),
      { initialProps: { enabled: false } },
    );
    act(() => pressUndo());
    expect(onUndo).not.toHaveBeenCalled();
    rerender({ enabled: true });
    act(() => pressUndo());
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("ignores undo while focus is in an editable field", () => {
    const onUndo = vi.fn();
    renderHook(() =>
      useUndoRedoShortcuts({
        canUndo: true,
        canRedo: true,
        onUndo,
        onRedo: vi.fn(),
      }),
    );
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(onUndo).not.toHaveBeenCalled();
  });
});
