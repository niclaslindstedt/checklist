// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import { NamespacesModal } from "../../src/ui/NamespacesModal.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderModal(
  props: Partial<React.ComponentProps<typeof NamespacesModal>> = {},
) {
  const handlers = {
    onClose: vi.fn(),
    onSwitch: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onSetAppearance: vi.fn(),
    onRemove: vi.fn(async () => {}),
  };
  render(
    <NamespacesModal
      open
      namespaces={[
        { slug: "default", name: "Default" },
        { slug: "family", name: "Family" },
      ]}
      activeNamespace="default"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("NamespacesModal", () => {
  it("lists the namespaces with the default badge", () => {
    renderModal();
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByText("Family")).toBeTruthy();
    expect(screen.getByText("default")).toBeTruthy(); // the badge
  });

  it("creates a namespace from the name field", () => {
    const { onCreate } = renderModal();
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Groceries" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith("Groceries");
  });

  it("switches to a namespace when its row is chosen", () => {
    const { onSwitch } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Family" }));
    expect(onSwitch).toHaveBeenCalledWith("family");
  });

  it("renames a namespace through the inline editor", () => {
    const { onRename } = renderModal();
    fireEvent.click(screen.getAllByLabelText("Rename namespace")[1]!);
    const input = screen.getByDisplayValue("Family");
    fireEvent.change(input, { target: { value: "Relatives" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).toHaveBeenCalledWith("family", "Relatives");
  });

  it("deletes a namespace after confirmation, and never offers to delete default", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onRemove } = renderModal();
    const deletes = screen.getAllByLabelText("Delete namespace");
    // Only the non-default namespace exposes a delete affordance.
    expect(deletes).toHaveLength(1);
    await act(async () => {
      fireEvent.click(deletes[0]!);
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("does not delete when confirmation is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onRemove } = renderModal();
    fireEvent.click(screen.getByLabelText("Delete namespace"));
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("picks an accent colour through the edit form, applied live", () => {
    const { onSetAppearance } = renderModal();
    // Open the default namespace's editor (the first rename affordance).
    fireEvent.click(screen.getAllByLabelText("Rename namespace")[0]!);
    fireEvent.click(screen.getByLabelText("Colour #98c379"));
    expect(onSetAppearance).toHaveBeenCalledWith("default", {
      color: "#98c379",
    });
  });

  it("picks an icon through the edit form, applied live", () => {
    const { onSetAppearance } = renderModal();
    fireEvent.click(screen.getAllByLabelText("Rename namespace")[1]!);
    fireEvent.click(screen.getByLabelText("Icon home"));
    expect(onSetAppearance).toHaveBeenCalledWith("family", { glyph: "home" });
  });

  it("clears the icon back to the default through the no-icon cell", () => {
    const { onSetAppearance } = renderModal({
      namespaces: [
        { slug: "default", name: "Default" },
        { slug: "family", name: "Family", glyph: "home", color: "#98c379" },
      ],
    });
    fireEvent.click(screen.getAllByLabelText("Rename namespace")[1]!);
    fireEvent.click(screen.getByLabelText("No icon"));
    expect(onSetAppearance).toHaveBeenCalledWith("family", { glyph: null });
  });
});
