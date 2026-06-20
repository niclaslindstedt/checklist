// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useSidebarInset } from "../../../src/ui/hooks/useSidebarInset.ts";

const root = document.documentElement;
const left = () => root.style.getPropertyValue("--app-content-left");
const right = () => root.style.getPropertyValue("--app-content-right");

afterEach(() => {
  root.style.removeProperty("--app-content-left");
  root.style.removeProperty("--app-content-right");
});

describe("useSidebarInset", () => {
  it("insets the docked edge when pinned on the left", () => {
    renderHook(() => useSidebarInset(true, "left"));
    expect(left()).toBe("16rem");
    expect(right()).toBe("0px");
  });

  it("insets the docked edge when pinned on the right", () => {
    renderHook(() => useSidebarInset(true, "right"));
    expect(right()).toBe("16rem");
    expect(left()).toBe("0px");
  });

  it("publishes a zero inset when not pinned", () => {
    renderHook(() => useSidebarInset(false, "left"));
    expect(left()).toBe("0px");
    expect(right()).toBe("0px");
  });

  it("tracks a side change", () => {
    const { rerender } = renderHook(
      ({ side }: { side: "left" | "right" }) => useSidebarInset(true, side),
      { initialProps: { side: "left" } as { side: "left" | "right" } },
    );
    expect(left()).toBe("16rem");
    rerender({ side: "right" });
    expect(left()).toBe("0px");
    expect(right()).toBe("16rem");
  });

  it("clears the variables on unmount so sidebar-less pages reset", () => {
    const { unmount } = renderHook(() => useSidebarInset(true, "left"));
    expect(left()).toBe("16rem");
    unmount();
    expect(left()).toBe("");
    expect(right()).toBe("");
  });
});
