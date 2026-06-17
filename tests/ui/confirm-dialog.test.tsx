// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { ConfirmDialog } from "../../src/ui/ConfirmDialog.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDialog(
  props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {},
) {
  const handlers = {
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
  render(
    <ConfirmDialog
      open
      title="Delete namespace"
      description="Delete “Family”?"
      confirmLabel="Delete"
      tone="danger"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("ConfirmDialog", () => {
  it("renders the title, description and actions", () => {
    renderDialog();
    expect(screen.getByText("Delete namespace")).toBeTruthy();
    expect(screen.getByText("Delete “Family”?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("announces itself as an alertdialog", () => {
    renderDialog();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("fires onConfirm when the confirm button is pressed", async () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("fires onCancel from the cancel button and the backdrop", () => {
    const { onCancel } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("falls back to the shared cancel label and a neutral confirm tone", () => {
    renderDialog({ tone: "default", cancelLabel: undefined });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("renders nothing while closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
