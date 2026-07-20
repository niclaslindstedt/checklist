// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";

import {
  FOOTER_COLLAPSED_KEY,
  setFooterCollapsed,
  useFooterCollapsed,
} from "../../../src/ui/hooks/useFooterCollapsed.ts";

function Probe() {
  const { collapsed } = useFooterCollapsed();
  return <span data-testid="state">{collapsed ? "collapsed" : "open"}</span>;
}

describe("useFooterCollapsed", () => {
  beforeEach(() => {
    // Reset the module-scoped singleton and its persisted value between tests.
    localStorage.clear();
    act(() => setFooterCollapsed(false));
  });

  afterEach(() => {
    act(() => setFooterCollapsed(false));
    localStorage.clear();
  });

  it("defaults to expanded (not collapsed)", () => {
    render(<Probe />);
    expect(screen.getByTestId("state").textContent).toBe("open");
  });

  it("persists the collapsed flag to localStorage and back", () => {
    render(<Probe />);
    act(() => setFooterCollapsed(true));
    expect(screen.getByTestId("state").textContent).toBe("collapsed");
    expect(localStorage.getItem(FOOTER_COLLAPSED_KEY)).toBe("true");
  });

  it("clears the key when set back to expanded", () => {
    act(() => setFooterCollapsed(true));
    expect(localStorage.getItem(FOOTER_COLLAPSED_KEY)).toBe("true");
    act(() => setFooterCollapsed(false));
    expect(localStorage.getItem(FOOTER_COLLAPSED_KEY)).toBeNull();
  });

  it("keeps every mounted reader in step through the shared store", () => {
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    act(() => setFooterCollapsed(true));
    for (const el of screen.getAllByTestId("state")) {
      expect(el.textContent).toBe("collapsed");
    }
  });
});
