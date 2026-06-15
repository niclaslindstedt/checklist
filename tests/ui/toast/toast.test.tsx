// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../../src/ui/toast/Toast.tsx";
import { useToast } from "../../../src/ui/toast/useToast.ts";

// A tiny harness that exposes the toast API to the test body via a ref,
// so each case can push without wiring a button per scenario.
function Harness({
  apiRef,
}: {
  apiRef: { current: ReturnType<typeof useToast> | null };
}) {
  apiRef.current = useToast();
  return null;
}

function renderWithToasts() {
  const apiRef: { current: ReturnType<typeof useToast> | null } = {
    current: null,
  };
  render(
    <ToastProvider>
      <Harness apiRef={apiRef} />
    </ToastProvider>,
  );
  return apiRef;
}

describe("ToastProvider", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders a pushed toast and auto-dismisses it after its duration", () => {
    const api = renderWithToasts();
    act(() => {
      api.current!.push({ message: "Saved", durationMs: 1000 });
    });
    expect(screen.getByText("Saved")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("caps the visible stack at three, dropping the oldest", () => {
    const api = renderWithToasts();
    act(() => {
      for (const msg of ["one", "two", "three", "four"]) {
        api.current!.push({ message: msg, durationMs: 99_999 });
      }
    });
    expect(screen.queryByText("one")).toBeNull();
    expect(screen.getByText("two")).toBeTruthy();
    expect(screen.getByText("three")).toBeTruthy();
    expect(screen.getByText("four")).toBeTruthy();
  });

  it("dismisses a toast by id", () => {
    const api = renderWithToasts();
    let id = 0;
    act(() => {
      id = api.current!.push({ message: "dismiss me", durationMs: 99_999 });
    });
    expect(screen.getByText("dismiss me")).toBeTruthy();
    act(() => {
      api.current!.dismiss(id);
    });
    expect(screen.queryByText("dismiss me")).toBeNull();
  });

  it("marks error toasts as assertive alerts", () => {
    const api = renderWithToasts();
    act(() => {
      api.current!.push({ kind: "error", message: "boom" });
    });
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.textContent).toContain("boom");
  });
});
