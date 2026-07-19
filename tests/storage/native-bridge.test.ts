// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  getNativeBridge,
  getNativeICloud,
  isICloudAvailable,
} from "../../src/storage/native-bridge.ts";

type MutableGlobal = { __native?: unknown };

afterEach(() => {
  delete (globalThis as MutableGlobal).__native;
});

describe("native bridge detection", () => {
  it("reports no bridge in a plain browser", () => {
    expect(getNativeBridge()).toBeNull();
    expect(isICloudAvailable()).toBe(false);
    expect(getNativeICloud()).toBeNull();
  });

  it("exposes the injected bridge object", () => {
    const bridge = { platform: "ios", icloud: {} };
    (globalThis as MutableGlobal).__native = bridge;
    expect(getNativeBridge()).toBe(bridge);
  });

  it("treats iOS + an icloud surface as available", () => {
    const icloud = { load: () => {}, save: () => {} };
    (globalThis as MutableGlobal).__native = { platform: "ios", icloud };
    expect(isICloudAvailable()).toBe(true);
    expect(getNativeICloud()).toBe(icloud);
  });

  it("does not offer iCloud on Android even with a surface present", () => {
    (globalThis as MutableGlobal).__native = {
      platform: "android",
      icloud: {},
    };
    expect(isICloudAvailable()).toBe(false);
    expect(getNativeICloud()).toBeNull();
  });

  it("does not offer iCloud on iOS when the surface is missing", () => {
    (globalThis as MutableGlobal).__native = { platform: "ios" };
    expect(isICloudAvailable()).toBe(false);
    expect(getNativeICloud()).toBeNull();
  });
});
