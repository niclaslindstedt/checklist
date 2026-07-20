// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Snapshot } from "../../src/domain/types.ts";
import { useNotificationScheduler } from "../../src/app/use-notification-scheduler.ts";

type MutableGlobal = { __native?: unknown };

afterEach(() => {
  delete (globalThis as MutableGlobal).__native;
  vi.useRealTimers();
});

function installBridge(overrides: {
  publish?: (json: string) => Promise<void>;
  getPermission?: () => Promise<string>;
  requestPermission?: () => Promise<string>;
}) {
  (globalThis as MutableGlobal).__native = {
    platform: "ios",
    notifications: {
      publish: overrides.publish ?? (async () => {}),
      getPermission: overrides.getPermission ?? (async () => "undetermined"),
      requestPermission: overrides.requestPermission ?? (async () => "granted"),
    },
  };
}

function docWithDeadline(deadline?: string): Snapshot {
  return {
    templates: [],
    checklists: [
      {
        version: 1,
        id: "a",
        templateId: "",
        name: "Trip",
        items: [
          deadline
            ? { id: "1", title: "Pack", checked: false, deadline }
            : { id: "1", title: "Pack", checked: false },
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

describe("useNotificationScheduler", () => {
  it("publishes a schedule after the debounce when native + loaded", async () => {
    vi.useFakeTimers();
    const publish = vi.fn((_json: string) => Promise.resolve());
    installBridge({ publish });

    renderHook(() =>
      useNotificationScheduler({
        snapshot: docWithDeadline("2999-01-01"),
        loaded: true,
        enabled: true,
        leadDays: [0],
      }),
    );

    expect(publish).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(publish).toHaveBeenCalledTimes(1);
    const schedule = JSON.parse(publish.mock.calls[0]![0] as string);
    expect(schedule.notifications).toHaveLength(1);
    expect(schedule.notifications[0]).toMatchObject({
      listId: "a",
      itemId: "1",
    });
  });

  it("publishes an empty schedule when reminders are disabled", async () => {
    vi.useFakeTimers();
    const publish = vi.fn((_json: string) => Promise.resolve());
    installBridge({ publish });

    renderHook(() =>
      useNotificationScheduler({
        snapshot: docWithDeadline("2999-01-01"),
        loaded: true,
        enabled: false,
        leadDays: [0],
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    const schedule = JSON.parse(publish.mock.calls[0]![0] as string);
    expect(schedule.notifications).toEqual([]);
  });

  it("requests permission when the document first gains a deadline", async () => {
    const requestPermission = vi.fn(async () => "granted");
    const onPermissionGranted = vi.fn();
    installBridge({ requestPermission });

    const { rerender } = renderHook(
      (props: { snapshot: Snapshot }) =>
        useNotificationScheduler({
          snapshot: props.snapshot,
          loaded: true,
          enabled: true,
          leadDays: [0],
          onPermissionGranted,
        }),
      { initialProps: { snapshot: docWithDeadline() } },
    );

    // No deadline yet → no prompt.
    await act(async () => {});
    expect(requestPermission).not.toHaveBeenCalled();

    // A deadline appears → prompt fires once, and the grant unlocks.
    await act(async () => {
      rerender({ snapshot: docWithDeadline("2999-01-01") });
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(onPermissionGranted).toHaveBeenCalledTimes(1);
  });

  it("does not prompt again once already granted", async () => {
    const requestPermission = vi.fn(async () => "granted");
    const onPermissionGranted = vi.fn();
    installBridge({
      getPermission: async () => "granted",
      requestPermission,
    });

    renderHook(() =>
      useNotificationScheduler({
        snapshot: docWithDeadline("2999-01-01"),
        loaded: true,
        enabled: true,
        leadDays: [0],
        onPermissionGranted,
      }),
    );
    await act(async () => {});
    // Already granted → no re-prompt, but still counted as granted (unlock).
    expect(requestPermission).not.toHaveBeenCalled();
    expect(onPermissionGranted).toHaveBeenCalledTimes(1);
  });

  it("is inert off-device (no bridge)", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useNotificationScheduler({
        snapshot: docWithDeadline("2999-01-01"),
        loaded: true,
        enabled: true,
        leadDays: [0],
      }),
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBeUndefined();
  });
});
