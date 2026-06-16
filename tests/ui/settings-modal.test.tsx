// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { defaultSettings } from "../../src/settings/store.ts";
import type { UseStorageBackend } from "../../src/storage/useStorageBackend.ts";
import { SettingsModal } from "../../src/ui/settings/SettingsModal.tsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function makeStorageStub(): UseStorageBackend {
  return {
    adapter: {
      id: "browser",
      label: "This device",
      capabilities: new Set(),
      async load() {
        return null;
      },
      async save(text: string) {
        return { text };
      },
    },
    backend: "browser",
    dropboxConfigured: false,
    gdriveConfigured: false,
    dropboxConnected: false,
    gdriveConnected: false,
    folderAvailable: false,
    folderConnected: false,
    folderReconnectNeeded: false,
    encryption: "plaintext",
    locked: false,
    selectBrowser: vi.fn(),
    connectFolder: vi.fn(async () => {}),
    reconnectFolder: vi.fn(async () => {}),
    disconnectFolder: vi.fn(async () => {}),
    connectDropbox: vi.fn(),
    disconnectDropbox: vi.fn(),
    connectGdrive: vi.fn(async () => {}),
    disconnectGdrive: vi.fn(),
    enableEncryption: vi.fn(async () => {}),
    disableEncryption: vi.fn(async () => {}),
    unlock: vi.fn(async () => {}),
    namespaces: [{ slug: "default", name: "Default" }],
    activeNamespace: "default",
    switchNamespace: vi.fn(),
    createNamespace: vi.fn(),
    renameNamespace: vi.fn(),
    removeNamespace: vi.fn(async () => {}),
  };
}

function renderModal(
  overrides: Partial<Parameters<typeof SettingsModal>[0]> = {},
) {
  const props = {
    open: true,
    onClose: vi.fn(),
    settings: defaultSettings(),
    onUpdate: vi.fn(),
    storage: makeStorageStub(),
    ...overrides,
  };
  const view = render(<SettingsModal {...props} />);
  return { ...props, ...view };
}

describe("SettingsModal", () => {
  it("lands on General with the General, Lists, Theme, and Storage tabs", () => {
    renderModal();
    expect(screen.getByRole("tab", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Lists" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Theme" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Developer" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Logs" })).toBeNull();
  });

  it("updates the theme when a variant is picked on the Theme tab", () => {
    const { onUpdate } = renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Theme" }));
    // The variant row lists the dark-family presets; pick Dracula.
    fireEvent.click(screen.getByRole("radio", { name: "Dracula" }));
    expect(onUpdate).toHaveBeenCalledWith("theme", "dracula");
  });

  it("updates addItemPosition from the Lists tab", () => {
    const { onUpdate } = renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Lists" }));
    fireEvent.click(screen.getByRole("radio", { name: "Top" }));
    expect(onUpdate).toHaveBeenCalledWith("addItemPosition", "top");
  });

  it("reveals the Developer and Logs tabs when developer mode is on", () => {
    renderModal();
    expect(screen.queryByRole("tab", { name: "Developer" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Developer mode"));
    expect(screen.getByRole("tab", { name: "Developer" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Logs" })).toBeTruthy();
    // Turn it back off so module-scoped dev state doesn't leak.
    fireEvent.click(screen.getByLabelText("Developer mode"));
    expect(screen.queryByRole("tab", { name: "Developer" })).toBeNull();
  });

  it("keeps the last-used tab when reopened without an initialTab", () => {
    const props = renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Storage" }));
    expect(
      screen
        .getByRole("tab", { name: "Storage" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    // Close and reopen the same dialog instance with no initialTab: the
    // chrome-skipping refactor keeps `activeTab` on the always-mounted
    // SettingsModal, so the last-used tab survives the round trip.
    props.rerender(<SettingsModal {...props} open={false} />);
    props.rerender(<SettingsModal {...props} open={true} />);
    expect(
      screen
        .getByRole("tab", { name: "Storage" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });
});
