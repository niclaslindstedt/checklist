// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { SaveStatus } from "../../src/app/use-checklist.ts";
import { SyncStatus } from "../../src/ui/SyncStatus.tsx";

afterEach(cleanup);

function renderStatus(
  overrides: Partial<React.ComponentProps<typeof SyncStatus>> = {},
) {
  const props = {
    providerName: "Dropbox",
    status: "idle" as SaveStatus,
    dirty: false,
    onSave: vi.fn(),
    onOpenDetails: vi.fn(),
    ...overrides,
  };
  render(<SyncStatus {...props} />);
  return props;
}

describe("SyncStatus", () => {
  it("shows a synced glyph and opens details when in sync", () => {
    const { onOpenDetails, onSave } = renderStatus({
      status: "saved",
      dirty: false,
    });
    const btn = screen.getByRole("button", { name: /Synced to Dropbox/ });
    fireEvent.click(btn);
    expect(onOpenDetails).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows an upload glyph and saves when there are unsaved edits", () => {
    const { onSave, onOpenDetails } = renderStatus({ dirty: true });
    const btn = screen.getByRole("button", { name: /Unsaved changes/ });
    fireEvent.click(btn);
    expect(onSave).toHaveBeenCalledOnce();
    expect(onOpenDetails).not.toHaveBeenCalled();
  });

  it("is disabled and busy while saving", () => {
    renderStatus({ status: "saving" });
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });

  it("surfaces a conflict over the dirty upload glyph", () => {
    const { onOpenDetails } = renderStatus({ status: "conflict", dirty: true });
    const btn = screen.getByRole("button", { name: /conflict/i });
    fireEvent.click(btn);
    expect(onOpenDetails).toHaveBeenCalledOnce();
  });

  it("shows a reconnect prompt on auth errors", () => {
    renderStatus({ status: "auth-error" });
    expect(
      screen.getByRole("button", { name: /Reconnect needed/ }),
    ).toBeTruthy();
  });
});
