// The `postMessage` bridge that lets the embedded web app reach native
// capabilities the WebView otherwise walls off. It has two halves:
//
//  1. A tiny JS shim injected into the page *before it loads*
//     (`buildInjectedBridge`), which defines `window.__native` — the exact
//     shape the web build's `src/storage/native-bridge.ts` reads. Each method
//     posts a `{ id, method, key, text }` request out through
//     `window.ReactNativeWebView.postMessage` and parks a promise keyed by
//     `id` until the native side answers.
//
//  2. The native message handler (`useNativeBridge`), which performs the
//     iCloud key-value operation and answers by injecting
//     `window.__nativeBridgeResolve(id, result)` back into the page. It also
//     forwards iCloud's cross-device change events by injecting
//     `window.__nativeBridgeChange(changedKeys)`.
//
// Three capabilities ride this channel: the iCloud key-value store (iOS), the
// Home Screen widget host (both platforms), and local deadline reminders via
// `expo-notifications`. Each is advertised on `window.__native` only when its
// native module actually loaded, so the web app feature-detects it as absent
// otherwise — on Android there is no `icloud`, a build without the widget
// module has no `widgets`, and one without `expo-notifications` has no
// `notifications`.

import { useCallback, useEffect, useMemo, type RefObject } from "react";
import { Platform } from "react-native";
import type { WebView, WebViewMessageEvent } from "react-native-webview";

import { getICloudKVS } from "./icloud";
import { getNotificationHost } from "./notifications";
import { getWidgetHost } from "./widgets";

// A bridge request as it arrives from the page.
interface BridgeRequest {
  __checklistBridge: true;
  id: number;
  method:
    | "load"
    | "save"
    | "remove"
    | "getRevision"
    | "widgetPublish"
    | "widgetPending"
    | "notificationPublish"
    | "notificationPermission"
    | "notificationRequest";
  key: string;
  text?: string;
}

// Encode a value as a JS expression safe to splice into `injectJavaScript`.
// `JSON.stringify` handles quoting/escaping; the two line separators are legal
// in JSON but historically not in JS string literals, so escape them too.
function encode(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Build the JS injected into the page before it loads. Defines
 * `window.__native` with a promise-based API over `postMessage`. `icloud` is
 * present only when `hasICloud` — so the web build feature-detects the
 * capability rather than assuming it from the platform.
 */
export function buildInjectedBridge(
  platform: string,
  hasICloud: boolean,
  hasWidgets: boolean,
  hasNotifications: boolean,
): string {
  // Kept as one IIFE string: the platform string and the capability flags are
  // interpolated in; everything else runs verbatim inside the WebView.
  return `(function () {
  if (window.__native) return;
  var pending = {};
  var seq = 0;
  var listeners = [];
  var widgetListeners = [];
  window.__nativeBridgeResolve = function (id, result) {
    var p = pending[id];
    if (p) { delete pending[id]; p.resolve(result); }
  };
  window.__nativeBridgeReject = function (id, message) {
    var p = pending[id];
    if (p) { delete pending[id]; p.reject(new Error(message || "native bridge error")); }
  };
  window.__nativeBridgeChange = function (changedKeys) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](changedKeys); } catch (e) {}
    }
  };
  window.__nativeBridgeWidgetAction = function () {
    for (var i = 0; i < widgetListeners.length; i++) {
      try { widgetListeners[i](); } catch (e) {}
    }
  };
  function call(method, key, text) {
    return new Promise(function (resolve, reject) {
      var id = ++seq;
      pending[id] = { resolve: resolve, reject: reject };
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          __checklistBridge: true, id: id, method: method, key: key, text: text
        }));
      } catch (e) { delete pending[id]; reject(e); }
    });
  }
  var icloud = ${hasICloud ? "true" : "false"} ? {
    load: function (key) { return call("load", key); },
    save: function (key, text) { return call("save", key, text); },
    remove: function (key) { return call("remove", key); },
    getRevision: function (key) { return call("getRevision", key); },
    subscribe: function (listener) {
      listeners.push(listener);
      return function () {
        var i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      };
    }
  } : undefined;
  var widgets = ${hasWidgets ? "true" : "false"} ? {
    publish: function (json) { return call("widgetPublish", "", json); },
    pending: function () { return call("widgetPending", ""); },
    subscribe: function (listener) {
      widgetListeners.push(listener);
      return function () {
        var i = widgetListeners.indexOf(listener);
        if (i >= 0) widgetListeners.splice(i, 1);
      };
    }
  } : undefined;
  var notifications = ${hasNotifications ? "true" : "false"} ? {
    getPermission: function () { return call("notificationPermission", ""); },
    requestPermission: function () { return call("notificationRequest", ""); },
    publish: function (json) { return call("notificationPublish", "", json); }
  } : undefined;
  window.__native = { platform: ${JSON.stringify(platform)}, icloud: icloud, widgets: widgets, notifications: notifications };
})();
true;`;
}

/**
 * Wire the native side of the bridge to a `WebView`. Returns the props to
 * spread onto it: the pre-load shim and the message handler. Also forwards
 * iCloud's cross-device change events into the page for the lifetime of the
 * mount.
 */
export function useNativeBridge(webViewRef: RefObject<WebView | null>): {
  injectedJavaScriptBeforeContentLoaded: string;
  onMessage: (event: WebViewMessageEvent) => void;
} {
  const kvs = useMemo(() => getICloudKVS(), []);
  const widgets = useMemo(() => getWidgetHost(), []);
  const notifications = useMemo(() => getNotificationHost(), []);

  const injectedJavaScriptBeforeContentLoaded = useMemo(
    () =>
      buildInjectedBridge(
        Platform.OS,
        kvs !== null,
        widgets !== null,
        notifications !== null,
      ),
    [kvs, widgets, notifications],
  );

  // Forward remote iCloud edits (another device pushed a change) into the page
  // so the web-side adapter's `watch` re-reads and updates the list.
  useEffect(() => {
    if (!kvs) return;
    return kvs.onChange((changedKeys) => {
      webViewRef.current?.injectJavaScript(
        `window.__nativeBridgeChange && window.__nativeBridgeChange(${encode(
          changedKeys,
        )}); true;`,
      );
    });
  }, [kvs, webViewRef]);

  // Forward the "a widget queued an action" signal into the page so the web
  // app drains the queue immediately (the interactive check-off widget's tap)
  // rather than waiting for the next foreground.
  useEffect(() => {
    if (!widgets) return;
    return widgets.onAction(() => {
      webViewRef.current?.injectJavaScript(
        `window.__nativeBridgeWidgetAction && window.__nativeBridgeWidgetAction(); true;`,
      );
    });
  }, [widgets, webViewRef]);

  // Forward a notification tap into the page as a deep link, reusing the same
  // `window.__checklistDeepLink` global the widgets / Control Center use — so a
  // tapped reminder brings its list to the front. Item-level scroll waits on a
  // per-item route (#272); switching to the list is the useful default today.
  useEffect(() => {
    if (!notifications) return;
    return notifications.onResponse((listId) => {
      webViewRef.current?.injectJavaScript(
        `window.__checklistDeepLink && window.__checklistDeepLink("open", ${encode(
          listId,
        )}); true;`,
      );
    });
  }, [notifications, webViewRef]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: BridgeRequest;
      try {
        msg = JSON.parse(event.nativeEvent.data) as BridgeRequest;
      } catch {
        return; // not our message
      }
      if (!msg || msg.__checklistBridge !== true) return;
      void handleRequest(kvs, widgets, notifications, msg, webViewRef);
    },
    [kvs, widgets, notifications, webViewRef],
  );

  return { injectedJavaScriptBeforeContentLoaded, onMessage };
}

// Perform one KVS operation and answer the parked promise in the page. Every
// failure is reported back as a rejection so the web adapter can log it rather
// than hang on a promise that never settles.
async function handleRequest(
  kvs: ReturnType<typeof getICloudKVS>,
  widgets: ReturnType<typeof getWidgetHost>,
  notifications: ReturnType<typeof getNotificationHost>,
  msg: BridgeRequest,
  webViewRef: RefObject<WebView | null>,
): Promise<void> {
  const resolve = (result: unknown) =>
    webViewRef.current?.injectJavaScript(
      `window.__nativeBridgeResolve && window.__nativeBridgeResolve(${msg.id}, ${encode(
        result,
      )}); true;`,
    );
  const reject = (message: string) =>
    webViewRef.current?.injectJavaScript(
      `window.__nativeBridgeReject && window.__nativeBridgeReject(${msg.id}, ${encode(
        message,
      )}); true;`,
    );

  // Notification calls go to the notification host, not the iCloud store, so
  // they're handled before the iCloud availability gate below.
  if (
    msg.method === "notificationPublish" ||
    msg.method === "notificationPermission" ||
    msg.method === "notificationRequest"
  ) {
    if (!notifications) {
      reject("notifications are not available");
      return;
    }
    try {
      if (msg.method === "notificationPublish") {
        await notifications.setSchedule(msg.text ?? "");
        resolve(null);
      } else if (msg.method === "notificationPermission") {
        resolve(await notifications.getPermission());
      } else {
        resolve(await notifications.requestPermission());
      }
    } catch (err) {
      reject(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // Widget calls go to the widget host, not the iCloud store, so they're
  // handled before the iCloud availability gate below.
  if (msg.method === "widgetPublish" || msg.method === "widgetPending") {
    if (!widgets) {
      reject("widgets are not available");
      return;
    }
    try {
      if (msg.method === "widgetPublish") {
        await widgets.setSnapshot(msg.text ?? "");
        resolve(null);
      } else {
        resolve(await widgets.takePendingActions());
      }
    } catch (err) {
      reject(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (!kvs) {
    reject("iCloud is not available");
    return;
  }
  try {
    switch (msg.method) {
      case "load": {
        const value = await kvs.getItem(msg.key);
        resolve(value == null ? null : { text: value });
        break;
      }
      case "save": {
        const text = msg.text ?? "";
        await kvs.setItem(msg.key, text);
        resolve({ text });
        break;
      }
      case "remove": {
        await kvs.removeItem(msg.key);
        resolve(null);
        break;
      }
      case "getRevision": {
        // NSUbiquitousKeyValueStore has no revision concept.
        resolve(null);
        break;
      }
      default: {
        reject(`unknown bridge method: ${String(msg.method)}`);
      }
    }
  } catch (err) {
    reject(err instanceof Error ? err.message : String(err));
  }
}
