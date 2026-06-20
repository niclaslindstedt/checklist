// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ItemCount } from "../../src/ui/ItemCount.tsx";

describe("ItemCount", () => {
  it("renders the checked / total fraction", () => {
    render(<ItemCount checked={1} total={3} />);
    const badge = screen.getByLabelText("1 of 3 items checked");
    expect(badge.textContent).toContain("1");
    expect(badge.textContent).toContain("/3");
  });

  it("partially fills the ring in proportion to progress", () => {
    const { container } = render(<ItemCount checked={1} total={4} />);
    // The second circle is the progress arc; a 25%-complete list leaves
    // three quarters of the circumference dashed off.
    const arc = container.querySelectorAll("circle")[1]!;
    const circumference = 2 * Math.PI * 7;
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      circumference * 0.75,
      3,
    );
  });

  it("marks a fully-checked list as complete via the success accent", () => {
    const { container } = render(<ItemCount checked={2} total={2} />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.className).toContain("border-success/40");
    expect(badge.className).toContain("text-success");
  });

  it("treats an empty list as zero progress without dividing by zero", () => {
    const { container } = render(<ItemCount checked={0} total={0} />);
    const arc = container.querySelectorAll("circle")[1]!;
    const circumference = 2 * Math.PI * 7;
    // No items checked of none — the arc is fully dashed off (empty ring).
    expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      circumference,
      3,
    );
    expect(screen.getByLabelText("0 of 0 items checked")).toBeTruthy();
  });
});
