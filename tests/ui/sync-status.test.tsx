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
    offline: false,
    onOpenDetails: vi.fn(),
    ...overrides,
  };
  render(<SyncStatus {...props} />);
  return props;
}

describe("SyncStatus", () => {
  // The glyph is one predictable way in: whatever the state, tapping it opens
  // the command-centre modal. It never doubles as a save button and is never
  // disabled — that dual-action / disabled-while-saving behaviour was the
  // "why won't it tap?" trap this redesign removed.
  it("shows a synced glyph and opens details when in sync", () => {
    const { onOpenDetails } = renderStatus({ status: "saved", dirty: false });
    fireEvent.click(screen.getByRole("button", { name: /Synced to Dropbox/ }));
    expect(onOpenDetails).toHaveBeenCalledOnce();
  });

  it("opens details (not an inline save) when there are unsaved edits", () => {
    const { onOpenDetails } = renderStatus({ dirty: true });
    fireEvent.click(screen.getByRole("button", { name: /Unsaved changes/ }));
    expect(onOpenDetails).toHaveBeenCalledOnce();
  });

  it("stays clickable and opens details while saving", () => {
    const { onOpenDetails } = renderStatus({ status: "saving" });
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(btn);
    expect(onOpenDetails).toHaveBeenCalledOnce();
  });

  it("surfaces a conflict over the dirty upload glyph", () => {
    const { onOpenDetails } = renderStatus({ status: "conflict", dirty: true });
    fireEvent.click(screen.getByRole("button", { name: /conflict/i }));
    expect(onOpenDetails).toHaveBeenCalledOnce();
  });

  it("shows a reconnect prompt on auth errors", () => {
    renderStatus({ status: "auth-error" });
    expect(
      screen.getByRole("button", { name: /Reconnect needed/ }),
    ).toBeTruthy();
  });

  it("shows an offline glyph instead of a synced one when on the local copy", () => {
    // Offline must win over an otherwise "synced" idle state so a stale
    // local copy never reads as in-sync with the cloud.
    const { onOpenDetails } = renderStatus({ status: "saved", offline: true });
    expect(
      screen.queryByRole("button", { name: /Synced to Dropbox/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Offline/i }));
    expect(onOpenDetails).toHaveBeenCalledOnce();
  });
});
