// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWidgetDeepLink } from "../../src/app/use-widget-deep-link.ts";
import { FOCUS_COMPOSER_EVENT } from "../../src/ui/composer-events.ts";

type DeepLinkGlobal = {
  __checklistDeepLink?: (action: string, listId?: string) => void;
};

afterEach(() => {
  delete (globalThis as DeepLinkGlobal).__checklistDeepLink;
  window.history.replaceState(null, "", "/");
});

describe("useWidgetDeepLink", () => {
  it("installs a global the wrapper can call to open a list", () => {
    const selectChecklist = vi.fn();
    renderHook(() => useWidgetDeepLink({ selectChecklist }));

    act(() => {
      (globalThis as DeepLinkGlobal).__checklistDeepLink!("open", "list-42");
    });
    expect(selectChecklist).toHaveBeenCalledWith("list-42");
  });

  it("dispatches the focus event for an add link", () => {
    const selectChecklist = vi.fn();
    const onFocus = vi.fn();
    window.addEventListener(FOCUS_COMPOSER_EVENT, onFocus);
    renderHook(() => useWidgetDeepLink({ selectChecklist }));

    act(() => {
      (globalThis as DeepLinkGlobal).__checklistDeepLink!("add", "list-7");
    });
    expect(selectChecklist).toHaveBeenCalledWith("list-7");
    expect(onFocus).toHaveBeenCalledTimes(1);
    window.removeEventListener(FOCUS_COMPOSER_EVENT, onFocus);
  });

  it("applies an ?add= cold-start param and strips it", () => {
    window.history.replaceState(null, "", "/?add=list-9&keep=1");
    const selectChecklist = vi.fn();
    const onFocus = vi.fn();
    window.addEventListener(FOCUS_COMPOSER_EVENT, onFocus);

    renderHook(() => useWidgetDeepLink({ selectChecklist }));

    expect(selectChecklist).toHaveBeenCalledWith("list-9");
    expect(onFocus).toHaveBeenCalledTimes(1);
    // The deep-link param is stripped; unrelated params survive.
    expect(window.location.search).toBe("?keep=1");
    window.removeEventListener(FOCUS_COMPOSER_EVENT, onFocus);
  });

  it("removes the global on unmount", () => {
    const { unmount } = renderHook(() =>
      useWidgetDeepLink({ selectChecklist: vi.fn() }),
    );
    expect((globalThis as DeepLinkGlobal).__checklistDeepLink).toBeTypeOf(
      "function",
    );
    unmount();
    expect((globalThis as DeepLinkGlobal).__checklistDeepLink).toBeUndefined();
  });
});
