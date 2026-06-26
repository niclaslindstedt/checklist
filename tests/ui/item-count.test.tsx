// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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

  it("stays a static span (not a button) without bulk handlers", () => {
    render(<ItemCount checked={1} total={3} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  describe("bulk-action dropdown", () => {
    it("opens a Check all / Uncheck all menu when pressed", () => {
      render(
        <ItemCount
          checked={1}
          total={3}
          onCheckAll={() => {}}
          onUncheckAll={() => {}}
        />,
      );
      const trigger = screen.getByRole("button", {
        name: "1 of 3 items checked",
      });
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      fireEvent.click(trigger);
      expect(screen.getByRole("menuitem", { name: "Check all" })).toBeTruthy();
      expect(
        screen.getByRole("menuitem", { name: "Uncheck all" }),
      ).toBeTruthy();
    });

    it("invokes the matching handler when an action is chosen", () => {
      const onCheckAll = vi.fn();
      const onUncheckAll = vi.fn();
      render(
        <ItemCount
          checked={1}
          total={3}
          onCheckAll={onCheckAll}
          onUncheckAll={onUncheckAll}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Check all" }));
      expect(onCheckAll).toHaveBeenCalledTimes(1);
      expect(onUncheckAll).not.toHaveBeenCalled();
    });

    it("disables Check all when everything is already checked", () => {
      render(
        <ItemCount
          checked={2}
          total={2}
          onCheckAll={() => {}}
          onUncheckAll={() => {}}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      expect(
        (
          screen.getByRole("menuitem", {
            name: "Check all",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(
        (
          screen.getByRole("menuitem", {
            name: "Uncheck all",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    it("colours the Check all glyph green and the Uncheck all glyph red", () => {
      render(
        <ItemCount
          checked={1}
          total={3}
          onCheckAll={() => {}}
          onUncheckAll={() => {}}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      const checkAll = screen.getByRole("menuitem", { name: "Check all" });
      const uncheckAll = screen.getByRole("menuitem", { name: "Uncheck all" });
      expect(checkAll.querySelector("svg")!.getAttribute("class")).toContain(
        "text-success",
      );
      expect(uncheckAll.querySelector("svg")!.getAttribute("class")).toContain(
        "text-danger",
      );
    });

    it("disables Uncheck all when nothing is checked", () => {
      render(
        <ItemCount
          checked={0}
          total={2}
          onCheckAll={() => {}}
          onUncheckAll={() => {}}
        />,
      );
      fireEvent.click(screen.getByRole("button"));
      expect(
        (
          screen.getByRole("menuitem", {
            name: "Uncheck all",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });
  });
});
