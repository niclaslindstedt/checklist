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
import type { EncryptionProgress } from "../../src/storage/useStorageBackend.ts";
import { UnlockGate } from "../../src/ui/UnlockGate.tsx";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UnlockGate", () => {
  it("renders a lone centered card on a solid page background, with no dimmed backdrop", () => {
    // The gate is not a `Modal`: there's nothing to reveal behind it, so it
    // paints a solid page background and floats one centered card on it —
    // no dimmed backdrop and no header/footer chrome. (Regression: the gate
    // used the full-screen mobile sheet, which pushed the unlock button into
    // a footer at the bottom of the viewport, hard to reach one-handed.)
    const { container } = render(<UnlockGate open onUnlock={async () => {}} />);
    const wrapper = screen.getByRole("form").parentElement;
    expect(wrapper?.className).toContain("items-center");
    expect(wrapper?.className).toContain("justify-center");
    expect(wrapper?.className).toContain("bg-page-bg");
    // No dimmed backdrop element behind the card.
    expect(container.querySelector(".bg-black\\/50")).toBeNull();
  });

  it("submits the typed passphrase", () => {
    const onUnlock = vi.fn(async () => {});
    render(<UnlockGate open onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "hunter2" },
    });
    fireEvent.submit(screen.getByRole("form"));
    // The gate now hands the flow a progress callback so it can flash a status
    // line while the passphrase is checked and the document decrypts.
    expect(onUnlock).toHaveBeenCalledWith("hunter2", expect.any(Function));
  });

  it("shows a wrong-passphrase message when unlock rejects generically", async () => {
    const onUnlock = vi.fn(async () => {
      throw new Error("Wrong password");
    });
    render(<UnlockGate open onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "nope" },
    });
    fireEvent.submit(screen.getByRole("form"));
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
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() => {
      const alert = screen.getByRole("alert").textContent ?? "";
      expect(alert).toMatch(/offline copy|reach your cloud/i);
      expect(alert).not.toMatch(/wrong passphrase/i);
    });
  });

  it("flashes what's happening and disables the button while unlocking", async () => {
    const gate = deferred<void>();
    const onUnlock = vi.fn((_pass: string, onProgress?: EncryptionProgress) => {
      // The storage layer brackets the load with these phases; the gate maps
      // the last one to the status line shown during the wait.
      onProgress?.("derivingKey");
      onProgress?.("decrypting");
      return gate.promise;
    });
    render(<UnlockGate open onUnlock={onUnlock} />);

    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "hunter2" },
    });
    fireEvent.submit(screen.getByRole("form"));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Decrypting your lists…");
    expect(
      (screen.getByRole("button", { name: "Unlock" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    gate.resolve();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("names the phases in unlock-specific terms", async () => {
    const gate = deferred<void>();
    const onUnlock = vi.fn((_pass: string, onProgress?: EncryptionProgress) => {
      onProgress?.("derivingKey");
      return gate.promise;
    });
    render(<UnlockGate open onUnlock={onUnlock} />);
    fireEvent.change(screen.getByLabelText(/passphrase/i), {
      target: { value: "hunter2" },
    });
    fireEvent.submit(screen.getByRole("form"));

    const status = await screen.findByRole("status");
    // Not the generic "Deriving encryption key…" the encryption toggle uses.
    expect(status.textContent).toContain("Checking your passphrase…");

    gate.resolve();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("shows no status bar before unlock is pressed", () => {
    render(<UnlockGate open onUnlock={vi.fn(async () => {})} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
