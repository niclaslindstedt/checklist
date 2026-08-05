// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readNavDestination,
  sameDestination,
  useNavHistory,
  type NavDestination,
} from "../../src/app/use-nav-history.ts";

const AT = (patch: Partial<NavDestination> = {}): NavDestination => ({
  namespace: "default",
  view: "checklist",
  listId: "a",
  templateId: null,
  ...patch,
});

/**
 * Drive the browser's own Back / Forward and wait for the popstate to land
 * (jsdom traverses the session history asynchronously).
 */
async function travel(direction: "back" | "forward"): Promise<void> {
  await act(async () => {
    const landed = new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
      setTimeout(resolve, 200);
    });
    window.history[direction]();
    await landed;
  });
}

function mount(initial: NavDestination, apply = vi.fn(), ready = true) {
  const view = renderHook(
    ({ destination }: { destination: NavDestination }) =>
      useNavHistory({ destination, ready, apply }),
    { initialProps: { destination: initial } },
  );
  return { ...view, apply };
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

/** The destination `apply` was last handed, ignoring the source argument. */
function lastApplied(apply: ReturnType<typeof vi.fn>): unknown {
  return apply.mock.calls.at(-1)?.[0];
}

describe("readNavDestination", () => {
  it("reads a destination back out of a history state", () => {
    mount(AT({ listId: "seed" }));
    expect(readNavDestination(window.history.state)).toEqual(
      AT({ listId: "seed" }),
    );
  });

  it("ignores states that aren't ours", () => {
    expect(readNavDestination(null)).toBeNull();
    expect(readNavDestination({ somethingElse: 1 })).toBeNull();
    expect(readNavDestination({ checklistNav: { listId: "a" } })).toBeNull();
    expect(
      readNavDestination({ checklistNav: { ...AT(), view: "moon" } }),
    ).toBeNull();
  });
});

describe("sameDestination", () => {
  it("compares every field", () => {
    expect(sameDestination(AT(), AT())).toBe(true);
    expect(sameDestination(AT(), AT({ listId: "b" }))).toBe(false);
    expect(sameDestination(AT(), AT({ view: "archive" }))).toBe(false);
    expect(sameDestination(AT(), AT({ templateId: "t1" }))).toBe(false);
    expect(sameDestination(AT(), AT({ namespace: "work" }))).toBe(false);
  });
});

describe("useNavHistory", () => {
  it("seeds the entry the app opened on without adding one", () => {
    const before = window.history.length;
    mount(AT());
    expect(window.history.length).toBe(before);
    expect(readNavDestination(window.history.state)).toEqual(AT());
  });

  it("records nothing until the document has loaded", () => {
    mount(AT(), vi.fn(), false);
    expect(readNavDestination(window.history.state)).toBeNull();
  });

  it("pushes an entry for a marked navigation", () => {
    const { result, rerender } = mount(AT());
    const before = window.history.length;

    act(() => result.current.markNavigation());
    rerender({ destination: AT({ listId: "b" }) });

    expect(window.history.length).toBe(before + 1);
    expect(readNavDestination(window.history.state)).toEqual(
      AT({ listId: "b" }),
    );
  });

  it("replaces the entry when the destination drifts on its own", () => {
    const { rerender } = mount(AT());
    const before = window.history.length;

    // No `markNavigation` — the selection fell back on its own (the open list
    // was archived), so the current entry is corrected in place.
    rerender({ destination: AT({ listId: "fallback" }) });

    expect(window.history.length).toBe(before);
    expect(readNavDestination(window.history.state)).toEqual(
      AT({ listId: "fallback" }),
    );
  });

  it("keeps foreign keys in the entry's state", () => {
    window.history.replaceState({ other: "keep" }, "", "/");
    mount(AT());
    expect((window.history.state as { other: string }).other).toBe("keep");
  });

  it("names the open list in the address bar, for bookmarking", () => {
    const { result, rerender } = mount(AT());
    expect(window.location.hash).toBe("#list=a");

    act(() => result.current.markNavigation());
    rerender({ destination: AT({ listId: "b", namespace: "work" }) });
    expect(window.location.hash).toBe("#list=b&ns=work");
  });

  it("opens on the list its URL names, not the one the cursor restored", () => {
    window.history.replaceState(null, "", "/#list=bookmarked&view=archive");
    const { apply } = mount(AT({ listId: "cursor" }));

    expect(apply).toHaveBeenCalledWith(
      AT({ listId: "bookmarked", view: "archive" }),
      "url",
    );
  });

  it("corrects the address bar when the URL's list is gone", () => {
    window.history.replaceState(null, "", "/#list=deleted");
    // The app applies it, falls back to a real list, and re-renders at the
    // destination it started on — unchanged, so only the extra pass catches it.
    const { apply } = mount(AT({ listId: "real" }));

    expect(apply).toHaveBeenCalledWith(AT({ listId: "deleted" }), "url");
    expect(window.location.hash).toBe("#list=real");
    expect(readNavDestination(window.history.state)).toEqual(
      AT({ listId: "real" }),
    );
  });

  it("leaves a share payload in the address bar alone", () => {
    const payload = "#H4sIAAAAAAAAA6tWKk5NLsosyUxWsjI0MjZRqgUAy7-i";
    window.history.replaceState(null, "", `/${payload}`);
    const { apply } = mount(AT());

    expect(apply).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(payload);
    // Ours from the user's first navigation onward.
    expect(readNavDestination(window.history.state)).toEqual(AT());
  });

  it("walks back and forward through the lists the user opened", async () => {
    const { result, rerender, apply } = mount(AT({ listId: "a" }));

    act(() => result.current.markNavigation());
    rerender({ destination: AT({ listId: "b" }) });
    act(() => result.current.markNavigation());
    rerender({ destination: AT({ listId: "c" }) });

    await travel("back");
    expect(lastApplied(apply)).toEqual(AT({ listId: "b" }));
    rerender({ destination: AT({ listId: "b" }) });

    await travel("back");
    expect(lastApplied(apply)).toEqual(AT({ listId: "a" }));
    rerender({ destination: AT({ listId: "a" }) });

    await travel("forward");
    expect(lastApplied(apply)).toEqual(AT({ listId: "b" }));
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it("carries the open view and template in the entry", async () => {
    const { result, rerender, apply } = mount(AT());

    act(() => result.current.markNavigation());
    rerender({ destination: AT({ view: "archive" }) });
    act(() => result.current.markNavigation());
    rerender({ destination: AT({ view: "archive", templateId: "t1" }) });

    await travel("back");
    expect(lastApplied(apply)).toEqual(AT({ view: "archive" }));
    expect(apply.mock.calls.at(-1)?.[1]).toBe("popstate");
  });

  it("does not re-record the destination it was sent back to", async () => {
    const { result, rerender, apply } = mount(AT({ listId: "a" }));
    act(() => result.current.markNavigation());
    rerender({ destination: AT({ listId: "b" }) });
    const afterPush = window.history.length;

    await travel("back");
    // The app applies it and re-renders at the restored destination.
    rerender({ destination: AT({ listId: "a" }) });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(window.history.length).toBe(afterPush);
    expect(readNavDestination(window.history.state)).toEqual(
      AT({ listId: "a" }),
    );
  });

  it("disarms a pending navigation when the user goes back first", async () => {
    const { result, rerender } = mount(AT({ listId: "a" }));
    act(() => result.current.markNavigation());
    rerender({ destination: AT({ listId: "b" }) });
    const afterPush = window.history.length;

    // A gesture that is announced but overtaken by the back button must not
    // leave the push armed for the next drift.
    act(() => result.current.markNavigation());
    await travel("back");
    rerender({ destination: AT({ listId: "a" }) });
    rerender({ destination: AT({ listId: "drifted" }) });

    expect(window.history.length).toBe(afterPush);
  });

  it("ignores an entry that carries no destination of ours", () => {
    const { apply } = mount(AT());
    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { someoneElse: true } }),
      );
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", async () => {
    const { result, rerender, apply, unmount } = mount(AT({ listId: "a" }));
    act(() => result.current.markNavigation());
    rerender({ destination: AT({ listId: "b" }) });

    unmount();
    await travel("back");
    expect(apply).not.toHaveBeenCalled();
  });
});
