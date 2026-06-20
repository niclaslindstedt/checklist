// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { EditNavBar } from "../../src/ui/EditNavBar.tsx";

function renderBar(over: Partial<Parameters<typeof EditNavBar>[0]> = {}) {
  const props = {
    canPrev: true,
    canNext: true,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onDone: vi.fn(),
    ...over,
  };
  render(<EditNavBar {...props} />);
  return props;
}

describe("EditNavBar", () => {
  it("fires prev / next / done from its buttons", () => {
    const props = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Edit previous item" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit next item" }));
    fireEvent.click(screen.getByRole("button", { name: "Done editing" }));
    expect(props.onPrev).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it("disables the up button at the top of the list", () => {
    renderBar({ canPrev: false });
    expect(
      (
        screen.getByRole("button", {
          name: "Edit previous item",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Edit next item",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("disables the down button at the bottom of the list", () => {
    renderBar({ canNext: false });
    expect(
      (
        screen.getByRole("button", {
          name: "Edit next item",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("keeps focus in the editor by preventing the mousedown default", () => {
    renderBar();
    const next = screen.getByRole("button", { name: "Edit next item" });
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    next.dispatchEvent(event);
    // preventDefault keeps the press from blurring (and committing/closing) the
    // focused input, so the bar survives the click.
    expect(event.defaultPrevented).toBe(true);
    cleanup();
  });
});
