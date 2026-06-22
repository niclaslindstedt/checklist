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
    onReload: vi.fn(),
    onReconnect: vi.fn(async () => {}),
    onCheckConnection: vi.fn(async () => "offline" as const),
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

  it("names the bare provider in the open-in link, without the (encrypted) suffix", () => {
    renderModal({ status: "saved", providerName: "Dropbox (encrypted)" });
    const link = screen.getByRole("link", { name: /open in/i });
    expect(link.textContent).toContain("Open in Dropbox");
    expect(link.textContent).not.toContain("(encrypted)");
  });

  it("renders as a compact centered card, not a full-screen sheet", () => {
    renderModal({ status: "saved" });
    const dialog = screen.getByRole("dialog");
    // The centered layout caps the card width and rounds it on every
    // viewport; the full-screen sheet would stretch to `h-full` instead.
    expect(dialog.className).toContain("max-w-md");
    expect(dialog.className).toContain("rounded-lg");
    expect(dialog.className).not.toContain("h-full");
  });

  it("explains the offline local-copy state instead of implying a sync", () => {
    renderModal({ status: "saved", offline: true });
    expect(screen.getByText("Offline")).toBeTruthy();
    expect(screen.getByText(/copy saved on this device/i)).toBeTruthy();
    // The "synced" heading must not show while offline.
    expect(screen.queryByText("Synced to Dropbox")).toBeNull();
  });

  it("offers a check-connection button while offline that pings the backend", async () => {
    const onCheckConnection = vi.fn(async () => "offline" as const);
    renderModal({ status: "saved", offline: true, onCheckConnection });
    fireEvent.click(screen.getByRole("button", { name: /Check connection/ }));
    await waitFor(() => expect(onCheckConnection).toHaveBeenCalledOnce());
    // The user is told the outcome rather than left staring at a dead button.
    await waitFor(() =>
      expect(screen.getByText(/Still can't reach Dropbox/)).toBeTruthy(),
    );
  });

  it("reports a successful reconnect from the check-connection probe", async () => {
    const onCheckConnection = vi.fn(async () => "online" as const);
    renderModal({ status: "saved", offline: true, onCheckConnection });
    fireEvent.click(screen.getByRole("button", { name: /Check connection/ }));
    await waitFor(() => expect(screen.getByText(/Back online/)).toBeTruthy());
  });

  it("shows no check-connection button when not offline", () => {
    renderModal({ status: "saved", offline: false });
    expect(
      screen.queryByRole("button", { name: /Check connection/ }),
    ).toBeNull();
  });

  // Command-centre surfaces ported from notes #118.
  it("offers a reload glyph (whatever the state) that re-reads the backend", () => {
    const { onReload } = renderModal({ status: "saved" });
    fireEvent.click(
      screen.getByRole("button", { name: /Reload from the backend/ }),
    );
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("shows the backend and at-rest encryption state in the details grid", () => {
    renderModal({ status: "saved", providerName: "Dropbox (encrypted)" });
    expect(screen.getByText("Encryption")).toBeTruthy();
    // The (encrypted) suffix flips the encryption detail to On.
    expect(screen.getByText("On")).toBeTruthy();
  });

  it("reads Off when the backend isn't encrypted", () => {
    renderModal({ status: "saved", providerName: "Dropbox" });
    expect(screen.getByText("Off")).toBeTruthy();
  });

  it("reveals the always-on sync log on demand", () => {
    renderModal({ status: "saved" });
    // Collapsed by default.
    expect(screen.queryByText(/sync activity logged/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /View sync log/ }));
    // Expanding shows the log panel (empty-state copy when nothing matched).
    expect(screen.getByText(/No sync activity logged yet/i)).toBeTruthy();
  });
});
