// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";

import { SyncLogPanel } from "../../src/ui/SyncLogPanel.tsx";
import { clearLogs, createLogger } from "../../src/dev/logger.ts";
import { useDevMode } from "../../src/dev/useDevMode.ts";
import type { TFunction } from "../../src/i18n";

// The panel takes its translator as a prop, so a key-echoing stub keeps the
// assertions about which string is shown, not about the catalog wording.
const t = ((key: string) => key) as TFunction;

// Logging is gated on developer mode (a no-op otherwise), so the ring buffer
// only fills when dev mode is on — flip it through the real hook, which also
// activates the logger's gate.
function setDevMode(on: boolean) {
  const { result, unmount } = renderHook(() => useDevMode());
  act(() => result.current.setDevMode(on));
  unmount();
}

beforeEach(() => {
  setDevMode(true);
  clearLogs();
});

afterEach(() => {
  cleanup();
  setDevMode(false);
  clearLogs();
});

describe("SyncLogPanel", () => {
  it("shows the empty-state copy when no sync-scoped entries exist", () => {
    render(<SyncLogPanel t={t} />);
    expect(screen.getByText("sync.syncLogEmpty")).toBeTruthy();
  });

  it("narrows the buffer to the cloud-sync scopes, dropping unrelated noise", () => {
    createLogger("dropbox").info("uploaded checklist.json");
    // `seed` is not in SYNC_LOG_SCOPES, so this must not surface in the panel.
    createLogger("seed").info("planted example templates");

    render(<SyncLogPanel t={t} />);

    expect(screen.getByText(/uploaded checklist\.json/)).toBeTruthy();
    expect(screen.queryByText(/planted example templates/)).toBeNull();
    // Only the one in-scope entry renders as a row.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("copies the in-scope entries chronologically to the clipboard", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.assign(navigator, { clipboard: { writeText } });

    createLogger("oauth").info("token refreshed");
    createLogger("gdrive").warn("retrying upload");

    render(<SyncLogPanel t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "sync.copyLog" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0]![0];
    // The copied text stays oldest-first (the natural reading order for a
    // pasted log), the reverse of the newest-first on-screen order.
    expect(copied.indexOf("token refreshed")).toBeLessThan(
      copied.indexOf("retrying upload"),
    );
    expect(copied).toContain("[oauth]");
    expect(copied).toContain("WARN");
    // The button flips to its copied-confirmation label.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "sync.copied" })).toBeTruthy(),
    );
  });

  it("reports a clipboard failure rather than swallowing it", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    Object.assign(navigator, { clipboard: { writeText } });

    createLogger("dropbox").error("upload failed");

    render(<SyncLogPanel t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "sync.copyLog" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "sync.copyFailed" }),
      ).toBeTruthy(),
    );
  });
});
