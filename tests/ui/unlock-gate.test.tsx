// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { OfflineUnavailableError } from "../../src/storage/cache/index.ts";
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

  it("shows a wrong-passphrase message when unlock rejects generically", async () => {
    const onUnlock = vi.fn(async () => {
      throw new Error("Wrong password");
    });
    render(<UnlockGate open onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "nope" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /wrong passphrase/i,
      );
    });
  });

  it("shows an offline message — not 'wrong passphrase' — when the backend is unreachable", async () => {
    // Regression: in airplane mode the gate used to blame the passphrase for
    // what was really a network failure. An `OfflineUnavailableError` must
    // surface the offline copy hint instead.
    const onUnlock = vi.fn(async () => {
      throw new OfflineUnavailableError();
    });
    render(<UnlockGate open onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "correct-but-offline" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => {
      const alert = screen.getByRole("alert").textContent ?? "";
      expect(alert).toMatch(/offline copy|reach your cloud/i);
      expect(alert).not.toMatch(/wrong passphrase/i);
    });
  });
});
