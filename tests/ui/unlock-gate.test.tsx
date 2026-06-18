// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { UnlockGate } from "../../src/ui/UnlockGate.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UnlockGate", () => {
  it("renders as a centered card so the prompt sits mid-screen on mobile", () => {
    // Regression: the gate used the full-screen mobile sheet, which pushed
    // the unlock button into a footer at the bottom of the viewport — hard
    // to reach one-handed on a phone. It must render centered on every size.
    render(<UnlockGate open onUnlock={async () => {}} />);
    const wrapper = screen.getByRole("dialog").parentElement;
    expect(wrapper?.className).toContain("items-center");
    expect(wrapper?.className).not.toContain("items-stretch");
  });

  it("submits the typed passphrase", () => {
    const onUnlock = vi.fn(async () => {});
    render(<UnlockGate open onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "hunter2" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(onUnlock).toHaveBeenCalledWith("hunter2");
  });
});
