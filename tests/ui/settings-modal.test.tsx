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
    settingsStore: null,
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
    moveChecklistToNamespace: vi.fn(async () => true),
    createNamespace: vi.fn(),
    renameNamespace: vi.fn(),
    setNamespaceAppearance: vi.fn(),
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
    onSave: vi.fn(),
    onPreviewAppearance: vi.fn(),
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

  it("commits a picked theme variant only on Save", () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Theme" }));
    // The variant row lists the dark-family presets; pick Dracula.
    fireEvent.click(screen.getByRole("radio", { name: "Dracula" }));
    // Editing the draft does not write through.
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "dracula" }),
    );
  });

  it("commits addItemPosition from the Lists tab on Save", () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Lists" }));
    fireEvent.click(screen.getByRole("radio", { name: "Top" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ addItemPosition: "top" }),
    );
  });

  it("commits a disableItemNotes toggle from the Lists tab on Save", () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Lists" }));
    fireEvent.click(screen.getByLabelText("Disable item notes"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ disableItemNotes: true }),
    );
  });

  it("commits a disableAchievements toggle from the General tab on Save", () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByLabelText("Disable achievements"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ disableAchievements: true }),
    );
  });

  it("discards edits and never saves when Cancel is pressed", () => {
    const { onSave, onClose } = renderModal();
    fireEvent.click(screen.getByRole("tab", { name: "Lists" }));
    fireEvent.click(screen.getByRole("radio", { name: "Top" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("previews appearance edits live, before saving", () => {
    const onPreviewAppearance = vi.fn();
    renderModal({ onPreviewAppearance });
    fireEvent.click(screen.getByRole("tab", { name: "Theme" }));
    fireEvent.click(screen.getByRole("radio", { name: "Dracula" }));
    // The most recent preview carries the draft theme so the engine can
    // project it onto `<html>` before the user commits.
    const last = onPreviewAppearance.mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ theme: "dracula" });
  });

  it("clears the appearance preview when the dialog closes", () => {
    const onPreviewAppearance = vi.fn();
    const props = renderModal({ onPreviewAppearance });
    onPreviewAppearance.mockClear();
    props.rerender(<SettingsModal {...props} open={false} />);
    expect(onPreviewAppearance).toHaveBeenCalledWith(null);
  });

  it("resets the owned fields to defaults from the footer", () => {
    const { onSave } = renderModal({
      settings: { ...defaultSettings(), addItemPosition: "top" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ addItemPosition: "bottom" }),
    );
  });

  it("reveals the Developer tab — but not Logs — when developer mode is on", () => {
    renderModal();
    expect(screen.queryByRole("tab", { name: "Developer" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Developer mode"));
    expect(screen.getByRole("tab", { name: "Developer" })).toBeTruthy();
    // Logs stays hidden until log capture is switched on.
    expect(screen.queryByRole("tab", { name: "Logs" })).toBeNull();
    // Turn it back off so module-scoped dev state doesn't leak.
    fireEvent.click(screen.getByLabelText("Developer mode"));
    expect(screen.queryByRole("tab", { name: "Developer" })).toBeNull();
  });

  it("shows the Logs tab only while log capture is enabled", () => {
    renderModal();
    fireEvent.click(screen.getByLabelText("Developer mode"));
    fireEvent.click(screen.getByRole("tab", { name: "Developer" }));
    // Enabling capture reveals the Logs tab; disabling it hides it again.
    fireEvent.click(screen.getByLabelText("Capture logs"));
    expect(screen.getByRole("tab", { name: "Logs" })).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Capture logs"));
    expect(screen.queryByRole("tab", { name: "Logs" })).toBeNull();
    // Turn dev mode back off (from General, where the toggle lives) so
    // module-scoped dev state doesn't leak.
    fireEvent.click(screen.getByRole("tab", { name: "General" }));
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
    // always-mounted SettingsModal keeps `activeTab`, so the last-used tab
    // survives the round trip.
    props.rerender(<SettingsModal {...props} open={false} />);
    props.rerender(<SettingsModal {...props} open={true} />);
    expect(
      screen
        .getByRole("tab", { name: "Storage" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });
});
