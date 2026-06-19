// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LanguagePicker } from "../../src/ui/LanguagePicker.tsx";

describe("LanguagePicker", () => {
  it("renders a flag button per supported language", () => {
    render(<LanguagePicker value="en" onChange={() => {}} />);
    // English is the default catalog (resident synchronously), so the
    // labels resolve without loading a code-split catalog.
    expect(screen.getByRole("radio", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Swedish" })).toBeTruthy();
  });

  it("marks the active language with aria-checked", () => {
    render(<LanguagePicker value="sv" onChange={() => {}} />);
    expect(
      screen
        .getByRole("radio", { name: "Swedish" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: "English" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("calls onChange with the clicked language", () => {
    const onChange = vi.fn();
    render(<LanguagePicker value="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Swedish" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("sv");
  });

  it("does not fire onChange when the active language is clicked", () => {
    const onChange = vi.fn();
    render(<LanguagePicker value="en" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
