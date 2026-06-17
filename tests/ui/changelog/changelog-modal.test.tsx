// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ChangelogModal } from "../../../src/ui/changelog/ChangelogModal.tsx";
import { FEATURE_DOCS } from "../../../src/ui/changelog/feature-docs.ts";

function noop(): void {}

describe("ChangelogModal feature-doc drill-down", () => {
  it("renders a Learn more link for a bullet that points at a bundled doc", () => {
    render(<ChangelogModal open onClose={noop} />);
    // The released changelog links several bullets to feature docs.
    expect(
      screen.getAllByRole("button", { name: "Learn more" }).length,
    ).toBeGreaterThan(0);
  });

  it("opens the matching feature doc in place and a Back button returns", () => {
    render(<ChangelogModal open onClose={noop} />);

    const [learnMore] = screen.getAllByRole("button", { name: "Learn more" });
    fireEvent.click(learnMore!);

    // The list view's heading is gone; a Back button now leads the header,
    // and the open doc's title fills it. The title must match one of the
    // bundled docs.
    const back = screen.getByRole("button", { name: "Back" });
    expect(back).toBeTruthy();
    const titles = Object.values(FEATURE_DOCS).map((d) => d.title);
    const heading = document.getElementById("changelog-title");
    expect(heading).not.toBeNull();
    expect(titles).toContain(heading!.textContent);

    // Back returns to the release list (the changelog heading reappears).
    fireEvent.click(back);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Learn more" }).length,
    ).toBeGreaterThan(0);
  });

  it("does not render when closed", () => {
    const { container } = render(
      <ChangelogModal open={false} onClose={noop} />,
    );
    expect(container.childElementCount).toBe(0);
  });
});
