// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ChecklistGlyphButton } from "../../src/ui/ChecklistGlyphButton.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderButton(
  props: Partial<React.ComponentProps<typeof ChecklistGlyphButton>> = {},
) {
  const onChange = vi.fn();
  render(
    <ChecklistGlyphButton
      glyph={null}
      color={null}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
}

describe("ChecklistGlyphButton", () => {
  const triggerName = "Change the list’s icon and colour";

  it("renders a collapsed picker trigger", () => {
    renderButton();
    const trigger = screen.getByRole("button", { name: triggerName });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("opens the Colour + Icon picker on click", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    expect(
      screen
        .getByRole("button", { name: triggerName })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    // Two radiogroups: the colour palette and the glyph grid.
    expect(screen.getAllByRole("radiogroup")).toHaveLength(2);
  });

  it("commits a colour pick", () => {
    const { onChange } = renderButton();
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    fireEvent.click(screen.getByRole("radio", { name: "Colour #98c379" }));
    expect(onChange).toHaveBeenCalledWith({ color: "#98c379" });
  });

  it("commits a glyph pick", () => {
    const { onChange } = renderButton();
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    fireEvent.click(screen.getByRole("radio", { name: "Icon cart" }));
    expect(onChange).toHaveBeenCalledWith({ glyph: "cart" });
  });

  it("clears back to the default mark via the leading cell", () => {
    const { onChange } = renderButton({ glyph: "cart" });
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    fireEvent.click(screen.getByRole("radio", { name: "Checklist (default)" }));
    expect(onChange).toHaveBeenCalledWith({ glyph: null });
  });

  it("marks the active glyph as checked", () => {
    renderButton({ glyph: "cart" });
    fireEvent.click(screen.getByRole("button", { name: triggerName }));
    expect(
      screen
        .getByRole("radio", { name: "Icon cart" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    // The default cell isn't the selected one when a glyph is set.
    expect(
      screen
        .getByRole("radio", { name: "Checklist (default)" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });
});
