// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NotificationSchedule } from "../../src/domain/notification-schedule.ts";
import {
  getNativeNotifications,
  isNotificationsAvailable,
} from "../../src/storage/native-bridge.ts";
import {
  getNotificationPermission,
  publishNotificationSchedule,
  requestNotificationPermission,
} from "../../src/storage/native-notifications.ts";

type MutableGlobal = { __native?: unknown };

afterEach(() => {
  delete (globalThis as MutableGlobal).__native;
});

const SCHEDULE: NotificationSchedule = {
  version: 1,
  updatedAt: "2026-07-15T12:00:00.000Z",
  notifications: [],
};

function withNotifications(over: Record<string, unknown>) {
  (globalThis as MutableGlobal).__native = {
    platform: "ios",
    notifications: {
      getPermission: async () => "undetermined",
      requestPermission: async () => "granted",
      publish: async () => {},
      ...over,
    },
  };
}

describe("notification bridge detection", () => {
  it("reports no bridge in a plain browser", () => {
    expect(isNotificationsAvailable()).toBe(false);
    expect(getNativeNotifications()).toBeNull();
  });

  it("detects the notification surface when injected", () => {
    const notifications = {
      getPermission: async () => "granted",
      requestPermission: async () => "granted",
      publish: async () => {},
    };
    (globalThis as MutableGlobal).__native = { platform: "ios", notifications };
    expect(isNotificationsAvailable()).toBe(true);
    expect(getNativeNotifications()).toBe(notifications);
  });
});

describe("publishNotificationSchedule", () => {
  it("serialises the schedule to the bridge", async () => {
    const publish = vi.fn(async () => {});
    withNotifications({ publish });
    await publishNotificationSchedule(SCHEDULE);
    expect(publish).toHaveBeenCalledWith(JSON.stringify(SCHEDULE));
  });

  it("is a silent no-op with no bridge", async () => {
    await expect(
      publishNotificationSchedule(SCHEDULE),
    ).resolves.toBeUndefined();
  });

  it("swallows a bridge failure", async () => {
    withNotifications({
      publish: async () => {
        throw new Error("boom");
      },
    });
    await expect(
      publishNotificationSchedule(SCHEDULE),
    ).resolves.toBeUndefined();
  });
});

describe("permission calls", () => {
  it("reads the current permission through the bridge", async () => {
    withNotifications({ getPermission: async () => "granted" });
    expect(await getNotificationPermission()).toBe("granted");
  });

  it("requests permission through the bridge", async () => {
    const requestPermission = vi.fn(async () => "granted");
    withNotifications({ requestPermission });
    expect(await requestNotificationPermission()).toBe("granted");
    expect(requestPermission).toHaveBeenCalled();
  });

  it("defaults to denied with no bridge or on failure", async () => {
    expect(await getNotificationPermission()).toBe("denied");
    expect(await requestNotificationPermission()).toBe("denied");

    withNotifications({
      getPermission: async () => {
        throw new Error("nope");
      },
      requestPermission: async () => {
        throw new Error("nope");
      },
    });
    expect(await getNotificationPermission()).toBe("denied");
    expect(await requestNotificationPermission()).toBe("denied");
  });
});
