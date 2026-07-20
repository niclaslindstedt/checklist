// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptySnapshot, type Snapshot } from "../../src/domain/types.ts";
import type { WidgetAction } from "../../src/domain/widget-snapshot.ts";
import { useWidgetMirror } from "../../src/app/use-widget-mirror.ts";

type MutableGlobal = { __native?: unknown };

afterEach(() => {
  delete (globalThis as MutableGlobal).__native;
  vi.useRealTimers();
});

function installBridge(overrides: {
  publish?: (json: string) => Promise<void>;
  pending?: () => Promise<string | null>;
  subscribe?: (listener: () => void) => () => void;
}) {
  (globalThis as MutableGlobal).__native = {
    platform: "ios",
    widgets: {
      publish: overrides.publish ?? (async () => {}),
      pending: overrides.pending ?? (async () => null),
      ...(overrides.subscribe ? { subscribe: overrides.subscribe } : {}),
    },
  };
}

const docWithList: Snapshot = {
  templates: [],
  checklists: [
    {
      version: 1,
      id: "a",
      templateId: "",
      name: "Groceries",
      items: [{ id: "1", title: "Milk", checked: false }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("useWidgetMirror", () => {
  it("publishes a snapshot after the debounce when loaded", async () => {
    vi.useFakeTimers();
    const publish = vi.fn((_json: string) => Promise.resolve());
    installBridge({ publish });

    renderHook(() =>
      useWidgetMirror({
        snapshot: docWithList,
        activeChecklistId: "a",
        loaded: true,
        sinkChecked: false,
        onAction: () => {},
      }),
    );

    expect(publish).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(publish).toHaveBeenCalledTimes(1);
    const snap = JSON.parse(publish.mock.calls[0]![0] as string);
    expect(snap.active).toMatchObject({ id: "a", name: "Groceries", total: 1 });
  });

  it("does not publish until loaded", async () => {
    vi.useFakeTimers();
    const publish = vi.fn(async () => {});
    installBridge({ publish });
    renderHook(() =>
      useWidgetMirror({
        snapshot: docWithList,
        activeChecklistId: "a",
        loaded: false,
        sinkChecked: false,
        onAction: () => {},
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it("does nothing at all with no bridge", async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    renderHook(() =>
      useWidgetMirror({
        snapshot: docWithList,
        activeChecklistId: "a",
        loaded: true,
        sinkChecked: false,
        onAction,
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("drains queued actions on mount and applies them", async () => {
    const pending = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify([{ type: "toggle", listId: "a", itemId: "1" }]),
      )
      .mockResolvedValue(null);
    installBridge({ pending });
    const onAction = vi.fn();

    renderHook(() =>
      useWidgetMirror({
        snapshot: emptySnapshot(),
        activeChecklistId: "a",
        loaded: true,
        sinkChecked: false,
        onAction,
      }),
    );

    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith<[WidgetAction]>({
        type: "toggle",
        listId: "a",
        itemId: "1",
      }),
    );
  });

  it("drains again when a native subscription fires", async () => {
    let fire: (() => void) | null = null;
    const pending = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        JSON.stringify([{ type: "toggle", listId: "a", itemId: "1" }]),
      )
      .mockResolvedValue(null);
    installBridge({
      pending,
      subscribe: (listener) => {
        fire = listener;
        return () => {};
      },
    });
    const onAction = vi.fn();

    renderHook(() =>
      useWidgetMirror({
        snapshot: emptySnapshot(),
        activeChecklistId: "a",
        loaded: true,
        sinkChecked: false,
        onAction,
      }),
    );

    await waitFor(() => expect(fire).not.toBeNull());
    act(() => fire!());
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith({
        type: "toggle",
        listId: "a",
        itemId: "1",
      }),
    );
  });
});
