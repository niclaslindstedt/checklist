// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WidgetSnapshot } from "../../src/domain/widget-snapshot.ts";
import {
  getNativeWidgets,
  isWidgetsAvailable,
} from "../../src/storage/native-bridge.ts";
import {
  drainWidgetActions,
  publishWidgetSnapshot,
  subscribeWidgetActions,
} from "../../src/storage/native-widgets.ts";

type MutableGlobal = { __native?: unknown };

afterEach(() => {
  delete (globalThis as MutableGlobal).__native;
});

const SNAPSHOT: WidgetSnapshot = {
  version: 1,
  updatedAt: "2026-07-15T12:00:00.000Z",
  active: null,
  lists: [],
  due: [],
};

describe("widget bridge detection", () => {
  it("reports no widget bridge in a plain browser", () => {
    expect(isWidgetsAvailable()).toBe(false);
    expect(getNativeWidgets()).toBeNull();
  });

  it("detects the widget surface on either platform", () => {
    const widgets = { publish: async () => {}, pending: async () => null };
    (globalThis as MutableGlobal).__native = { platform: "android", widgets };
    expect(isWidgetsAvailable()).toBe(true);
    expect(getNativeWidgets()).toBe(widgets);
  });
});

describe("publishWidgetSnapshot", () => {
  it("serialises the snapshot to the bridge", async () => {
    const publish = vi.fn(async () => {});
    (globalThis as MutableGlobal).__native = {
      platform: "ios",
      widgets: { publish, pending: async () => null },
    };
    await publishWidgetSnapshot(SNAPSHOT);
    expect(publish).toHaveBeenCalledWith(JSON.stringify(SNAPSHOT));
  });

  it("is a silent no-op with no bridge", async () => {
    await expect(publishWidgetSnapshot(SNAPSHOT)).resolves.toBeUndefined();
  });

  it("swallows a bridge failure", async () => {
    (globalThis as MutableGlobal).__native = {
      platform: "ios",
      widgets: {
        publish: async () => {
          throw new Error("boom");
        },
        pending: async () => null,
      },
    };
    await expect(publishWidgetSnapshot(SNAPSHOT)).resolves.toBeUndefined();
  });
});

describe("drainWidgetActions", () => {
  function withPending(value: string | null) {
    (globalThis as MutableGlobal).__native = {
      platform: "ios",
      widgets: { publish: async () => {}, pending: async () => value },
    };
  }

  it("parses queued toggle actions", async () => {
    withPending(
      JSON.stringify([
        { type: "toggle", listId: "a", itemId: "1" },
        { type: "toggle", listId: "b", itemId: "2" },
      ]),
    );
    const actions = await drainWidgetActions();
    expect(actions).toEqual([
      { type: "toggle", listId: "a", itemId: "1" },
      { type: "toggle", listId: "b", itemId: "2" },
    ]);
  });

  it("drops malformed entries but keeps valid ones", async () => {
    withPending(
      JSON.stringify([
        { type: "toggle", listId: "a", itemId: "1" },
        { type: "nope" },
        42,
      ]),
    );
    expect(await drainWidgetActions()).toEqual([
      { type: "toggle", listId: "a", itemId: "1" },
    ]);
  });

  it("returns [] for empty, null, or invalid JSON", async () => {
    withPending(null);
    expect(await drainWidgetActions()).toEqual([]);
    withPending("[]");
    expect(await drainWidgetActions()).toEqual([]);
    withPending("not json");
    expect(await drainWidgetActions()).toEqual([]);
  });

  it("returns [] with no bridge", async () => {
    expect(await drainWidgetActions()).toEqual([]);
  });
});

describe("subscribeWidgetActions", () => {
  it("returns a no-op unsubscribe when the platform can't push", () => {
    (globalThis as MutableGlobal).__native = {
      platform: "ios",
      widgets: { publish: async () => {}, pending: async () => null },
    };
    expect(() => subscribeWidgetActions(() => {})()).not.toThrow();
  });

  it("wires through a supported subscribe", () => {
    const unsub = vi.fn();
    const subscribe = vi.fn(() => unsub);
    (globalThis as MutableGlobal).__native = {
      platform: "ios",
      widgets: {
        publish: async () => {},
        pending: async () => null,
        subscribe,
      },
    };
    const listener = () => {};
    const off = subscribeWidgetActions(listener);
    expect(subscribe).toHaveBeenCalledWith(listener);
    off();
    expect(unsub).toHaveBeenCalled();
  });
});
