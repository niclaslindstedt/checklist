// @vitest-environment jsdom
import { afterEach } from "vitest";
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import type { ChecklistItem } from "../../src/domain/types.ts";
import { DragGhostRow } from "../../src/ui/DragGhostRow.tsx";

const item: ChecklistItem = { id: "i1", title: "Buy milk", checked: false };

function renderGhost(depth: number) {
  return render(
    <ul>
      <DragGhostRow item={item} depth={depth} />
    </ul>,
  );
}

afterEach(cleanup);

describe("DragGhostRow", () => {
  it("shows the dragged item's title as a non-interactive marker", () => {
    const { container } = renderGhost(0);
    expect(container.querySelector("[data-drag-ghost]")).toBeTruthy();
    expect(container.textContent).toContain("Buy milk");
    // It's a preview, not a row: aria-hidden and pointer-events off.
    const li = container.querySelector("li")!;
    expect(li.getAttribute("aria-hidden")).toBe("true");
    expect(li.className).toContain("pointer-events-none");
  });

  it("indents one step per nesting level so it reads as a sub-item", () => {
    const flat = renderGhost(0).container.querySelector("li")!;
    expect(flat.style.paddingLeft).toBe("");
    cleanup();
    const nested = renderGhost(2).container.querySelector("li")!;
    // depth 2 → calc() carrying the per-level indent (22px × 2).
    expect(nested.style.paddingLeft).toContain("44px");
  });
});
