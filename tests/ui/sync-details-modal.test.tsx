// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { SaveStatus } from "../../src/app/use-checklist.ts";
import { SyncDetailsModal } from "../../src/ui/SyncDetailsModal.tsx";

afterEach(cleanup);

function renderModal(
  overrides: Partial<React.ComponentProps<typeof SyncDetailsModal>> = {},
) {
  const props = {
    open: true,
    backend: "dropbox" as const,
    namespace: "default",
    providerName: "Dropbox",
    status: "idle" as SaveStatus,
    statusDetail: null as string | null,
    dirty: false,
    offline: false,
    onSaveNow: vi.fn(),
    onReconnect: vi.fn(async () => {}),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<SyncDetailsModal {...props} />);
  return props;
}

describe("SyncDetailsModal", () => {
  it("surfaces the captured failure reason so the user sees why", () => {
    renderModal({
      status: "error",
      statusDetail: "Dropbox upload failed: 507 insufficient_space",
    });
    expect(screen.getByText("Sync failed")).toBeTruthy();
    expect(
      screen.getByText(/Dropbox upload failed: 507 insufficient_space/),
    ).toBeTruthy();
  });

  it("falls back to a generic reason when no message was captured", () => {
    renderModal({ status: "error", statusDetail: null });
    expect(screen.getByText(/didn't go through/)).toBeTruthy();
  });

  it("offers a try-again button on error that saves now", () => {
    const { onSaveNow } = renderModal({ status: "error" });
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(onSaveNow).toHaveBeenCalledOnce();
  });

  it("offers a reconnect button on auth errors", async () => {
    const { onReconnect } = renderModal({ status: "auth-error" });
    fireEvent.click(screen.getByRole("button", { name: /Reconnect Dropbox/ }));
    await waitFor(() => expect(onReconnect).toHaveBeenCalledOnce());
  });

  it("surfaces a failed reconnect inline", async () => {
    const onReconnect = vi.fn(async () => {
      throw new Error("popup blocked");
    });
    renderModal({ status: "auth-error", onReconnect });
    fireEvent.click(screen.getByRole("button", { name: /Reconnect Dropbox/ }));
    await waitFor(() => expect(screen.getByText("popup blocked")).toBeTruthy());
  });

  it("links out to the provider's web UI", () => {
    renderModal({ status: "saved" });
    const link = screen.getByRole("link", {
      name: /Open in Dropbox/,
    }) as HTMLAnchorElement;
    expect(link.href).toContain("dropbox.com");
  });

  it("shows no web link for the local folder backend", () => {
    renderModal({ backend: "folder", providerName: "Local folder" });
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("explains the offline local-copy state instead of implying a sync", () => {
    renderModal({ status: "saved", offline: true });
    expect(screen.getByText("Offline")).toBeTruthy();
    expect(screen.getByText(/copy saved on this device/i)).toBeTruthy();
    // The "synced" heading must not show while offline.
    expect(screen.queryByText("Synced to Dropbox")).toBeNull();
  });
});
