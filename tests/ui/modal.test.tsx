// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Modal } from "../../src/ui/Modal.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Modal", () => {
  it("renders nothing while closed", () => {
    render(
      <Modal open={false} onClose={() => {}} labelledBy="t">
        <h2 id="t">Title</h2>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape via the latest onClose, even when its identity changes", () => {
    const onClose = vi.fn();
    // A parent that re-renders (new inline onClose each time) between mount
    // and the Escape press — mirrors a stateful caller like UnlockGate.
    function Host() {
      const [, setN] = useState(0);
      return (
        <>
          <button onClick={() => setN((n) => n + 1)}>bump</button>
          <Modal open onClose={() => onClose()} labelledBy="t">
            <h2 id="t">Title</h2>
          </Modal>
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByText("bump"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps focus on a typed-into input when the parent re-renders with a fresh onClose", () => {
    // Regression: the focus-management effect used to key on `onClose`. A
    // caller passing an inline arrow re-ran the effect on every keystroke,
    // refocusing the card and dismissing the mobile soft keyboard.
    function Host() {
      const [value, setValue] = useState("");
      return (
        <Modal open onClose={() => {}} labelledBy="t">
          <h2 id="t">Title</h2>
          <input
            aria-label="field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Modal>
      );
    }
    render(<Host />);
    const input = screen.getByLabelText("field") as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "a" } });
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "ab" } });
    expect(document.activeElement).toBe(input);
  });
});
