// @vitest-environment jsdom
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The native bridge (`native/src/nativeBridge.ts`, its injected script in
// `nativeBridgeScript.ts`) against the page's side of the contract,
// `src/storage/native-bridge.ts`.
//
// The phone app injects `window.__native` before the page loads; the page reads
// it through `getNativeICloud` / `getNativeWidgets` / `getNativeNotifications`.
// A method name or message field that drifts on one side is silent — iCloud
// sync, the widgets or the reminders just stop, on a build nobody can run
// without Xcode. So the injected script is RUN against the page's real
// `window`, and the page's own accessors read what it defines.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildInjectedBridge } from "../../native/src/nativeBridgeScript.ts";
import {
  getNativeBridge,
  getNativeICloud,
  getNativeNotifications,
  getNativeWidgets,
} from "../../src/storage/native-bridge.ts";

type Posted = {
  __checklistBridge: true;
  id: number;
  method: string;
  key: string;
  text?: string;
};

let posted: Posted[];

function inject(script: string): void {
  // The WebView runs it as a classic script in the page's global scope.
  new Function(script)();
}

beforeEach(() => {
  posted = [];
  Object.assign(window, {
    ReactNativeWebView: {
      postMessage: (data: string) => posted.push(JSON.parse(data) as Posted),
    },
  });
});

afterEach(() => {
  for (const name of [
    "__native",
    "__nativeBridgeResolve",
    "__nativeBridgeReject",
    "__nativeBridgeChange",
    "__nativeBridgeWidgetAction",
    "ReactNativeWebView",
  ]) {
    delete (window as unknown as Record<string, unknown>)[name];
  }
});

describe("the injected bridge", () => {
  it("offers the page every capability the shell has, by the page's names", () => {
    inject(buildInjectedBridge("ios", true, true, true));
    expect(getNativeBridge()?.platform).toBe("ios");
    const icloud = getNativeICloud()!;
    for (const method of [
      "load",
      "save",
      "remove",
      "getRevision",
      "subscribe",
    ] as const) {
      expect(typeof icloud[method], method).toBe("function");
    }
    const widgets = getNativeWidgets()!;
    for (const method of ["publish", "pending", "subscribe"] as const) {
      expect(typeof widgets[method], method).toBe("function");
    }
    const notifications = getNativeNotifications()!;
    for (const method of [
      "getPermission",
      "requestPermission",
      "publish",
    ] as const) {
      expect(typeof notifications[method], method).toBe("function");
    }
  });

  it("leaves out what the shell lacks, so the page feature-detects it", () => {
    inject(buildInjectedBridge("android", false, false, false));
    expect(getNativeBridge()?.platform).toBe("android");
    expect(getNativeICloud()).toBeNull();
    expect(getNativeWidgets()).toBeNull();
    expect(getNativeNotifications()).toBeNull();
  });

  it("round-trips a call: the request the native side reads, the answer it injects", async () => {
    inject(buildInjectedBridge("ios", true, true, true));
    const saved = getNativeICloud()!.save("checklist:doc", "# Lists");
    expect(posted).toEqual([
      {
        __checklistBridge: true,
        id: 1,
        method: "save",
        key: "checklist:doc",
        text: "# Lists",
      },
    ]);
    (
      window as unknown as {
        __nativeBridgeResolve: (id: number, result: unknown) => void;
      }
    ).__nativeBridgeResolve(1, { text: "# Lists" });
    await expect(saved).resolves.toEqual({ text: "# Lists" });

    const pending = getNativeWidgets()!.pending();
    expect(posted[1]).toMatchObject({ id: 2, method: "widgetPending" });
    (
      window as unknown as {
        __nativeBridgeReject: (id: number, message: string) => void;
      }
    ).__nativeBridgeReject(2, "widgets are not available");
    await expect(pending).rejects.toThrow("widgets are not available");
  });

  it("hands the page iCloud's change events and a widget's queued action", () => {
    inject(buildInjectedBridge("ios", true, true, false));
    const changes: (string[] | null)[] = [];
    const unsubscribe = getNativeICloud()!.subscribe((keys) =>
      changes.push(keys),
    );
    let actions = 0;
    getNativeWidgets()!.subscribe?.(() => actions++);
    const page = window as unknown as {
      __nativeBridgeChange: (keys: string[] | null) => void;
      __nativeBridgeWidgetAction: () => void;
    };
    page.__nativeBridgeChange(["checklist:doc"]);
    page.__nativeBridgeWidgetAction();
    unsubscribe();
    page.__nativeBridgeChange(null);
    expect(changes).toEqual([["checklist:doc"]]);
    expect(actions).toBe(1);
  });

  it("keeps an odd platform string a string", () => {
    inject(
      buildInjectedBridge('ios"; window.pwned = true; "', false, false, false),
    );
    expect(getNativeBridge()?.platform).toBe('ios"; window.pwned = true; "');
    expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
  });

  it("is injected once, whatever the WebView does on a reload", () => {
    inject(buildInjectedBridge("ios", true, false, false));
    const first = getNativeBridge();
    inject(buildInjectedBridge("android", false, false, false));
    expect(getNativeBridge()).toBe(first);
  });
});
