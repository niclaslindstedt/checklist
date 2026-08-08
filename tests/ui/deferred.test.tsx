// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defer, warmDeferred } from "../../src/ui/deferred.tsx";

afterEach(cleanup);

function Loaded({ label }: { label: string }) {
  return <p>loaded:{label}</p>;
}

// Models a modal: mounted whenever its chunk is resident, hidden by `open`.
function LoadedModal({ open, label }: { open: boolean; label: string }) {
  if (!open) return null;
  return <p>modal:{label}</p>;
}

// A loader this test resolves by hand, so the window where the chunk is still
// in flight is observable rather than a race.
function controllable() {
  let resolve!: (component: typeof Loaded) => void;
  let reject!: (error: unknown) => void;
  const load = vi.fn(
    () =>
      new Promise<typeof Loaded>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return {
    load,
    resolve: () => resolve(Loaded),
    fail: () => reject(new Error("chunk 404")),
  };
}

describe("defer", () => {
  it("renders nothing until the chunk lands, then the real component", async () => {
    const { load, resolve } = controllable();
    const Deferred = defer(load);

    render(<Deferred label="x" />);
    expect(screen.queryByText("loaded:x")).toBeNull();

    await act(async () => {
      resolve();
    });
    expect(screen.getByText("loaded:x")).toBeTruthy();
  });

  it("does not fetch a surface nothing has activated", () => {
    const { load } = controllable();
    const Deferred = defer(load);

    render(<Deferred active={false} label="x" />);
    expect(load).not.toHaveBeenCalled();
  });

  it("fetches once activated, and only once", async () => {
    const { load, resolve } = controllable();
    const Deferred = defer(load);

    const { rerender } = render(<Deferred active={false} label="x" />);
    expect(load).not.toHaveBeenCalled();

    rerender(<Deferred active label="x" />);
    await act(async () => {
      resolve();
    });
    expect(screen.getByText("loaded:x")).toBeTruthy();

    // Closing and reopening, and a second mount, reuse the resident chunk.
    rerender(<Deferred active={false} label="x" />);
    rerender(<Deferred active label="x" />);
    render(<Deferred active label="y" />);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("passes its own props through and keeps `active` to itself", async () => {
    const { load, resolve } = controllable();
    const Deferred = defer(load);
    render(<Deferred active label="passed-through" />);
    await act(async () => {
      resolve();
    });
    expect(screen.getByText(/passed-through/)).toBeTruthy();
  });

  // The property the modals depend on: `Modal` focuses its input in a layout
  // effect so the soft keyboard rises inside the tap, and `SideMenu` dispatches
  // the search command inside `flushSync`. That only holds if a resident chunk
  // renders on the *first* render that activates it, with no promise turn in
  // between.
  it("opens in the same render once resident, with no promise turn", async () => {
    vi.useFakeTimers();
    const idle = (globalThis as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    delete (globalThis as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    try {
      let resolve!: (component: typeof LoadedModal) => void;
      const load = vi.fn(
        () => new Promise<typeof LoadedModal>((res) => (resolve = res)),
      );
      const Deferred = defer(load, { warm: true });

      // Mount shut, then let the post-paint warm-up land — what the app does.
      const { rerender } = render(
        <Deferred active={false} open={false} label="x" />,
      );
      warmDeferred();
      vi.advanceTimersByTime(1_000);
      await act(async () => {
        resolve(LoadedModal);
      });
      // Resident and mounted, but its own `open` still hides it.
      expect(screen.queryByText("modal:x")).toBeNull();

      // Opening paints it in this very render — no `act`, no extra tick. This
      // is what keeps the iOS soft keyboard working for the search field.
      rerender(<Deferred active open label="x" />);
      expect(screen.getByText("modal:x")).toBeTruthy();
    } finally {
      if (idle !== undefined) {
        (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback =
          idle;
      }
      vi.useRealTimers();
    }
  });

  it("lets a failed chunk request retry instead of staying dead", async () => {
    const { load, fail } = controllable();
    const Deferred = defer(load);

    const { rerender } = render(<Deferred active label="x" />);
    await act(async () => {
      fail();
    });
    expect(screen.queryByText("loaded:x")).toBeNull();

    rerender(<Deferred active={false} label="x" />);
    rerender(<Deferred active label="x" />);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("warmDeferred", () => {
  it("prefetches only the surfaces that asked to be warmed", () => {
    vi.useFakeTimers();
    // Force the timeout branch — Safari still has no requestIdleCallback.
    const idle = (globalThis as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    delete (globalThis as { requestIdleCallback?: unknown })
      .requestIdleCallback;
    try {
      const warmed = controllable();
      const onDemand = controllable();
      defer(warmed.load, { warm: true });
      defer(onDemand.load);

      warmDeferred();
      expect(warmed.load).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1_000);
      expect(warmed.load).toHaveBeenCalledTimes(1);
      // The point of the opt-in: an unopened surface is never even fetched.
      expect(onDemand.load).not.toHaveBeenCalled();
    } finally {
      if (idle !== undefined) {
        (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback =
          idle;
      }
      vi.useRealTimers();
    }
  });
});
