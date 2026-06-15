// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { defaultSettings } from "../../src/settings/store.ts";
import { SettingsModal } from "../../src/ui/settings/SettingsModal.tsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderModal(
  overrides: Partial<Parameters<typeof SettingsModal>[0]> = {},
) {
  const props = {
    open: true,
    onClose: vi.fn(),
    settings: defaultSettings(),
    onUpdate: vi.fn(),
    ...overrides,
  };
  render(<SettingsModal {...props} />);
  return props;
}

describe("SettingsModal", () => {
  it("lands on General with only General and Theme tabs", () => {
    renderModal();
    expect(screen.getByRole("tab", { name: "General" })).toBeTruthy();
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
});
