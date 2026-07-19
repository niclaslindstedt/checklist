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
// Only iCloud is wired today; the same channel is what the widgets work
// (#263) will build on. The shim advertises `icloud` only when the native KVS
// is actually available (iOS with the module loaded), so on Android and on
// any failure the web app feature-detects it as absent and never offers the
// backend.

import { useCallback, useEffect, useMemo, type RefObject } from "react";
import { Platform } from "react-native";
import type { WebView, WebViewMessageEvent } from "react-native-webview";

import { getICloudKVS } from "./icloud";

// A bridge request as it arrives from the page.
interface BridgeRequest {
  __checklistBridge: true;
  id: number;
  method: "load" | "save" | "remove" | "getRevision";
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
): string {
  // Kept as one IIFE string. `PLATFORM` / `__HAS_ICLOUD__` are substituted
  // below; everything else runs verbatim inside the WebView.
  return `(function () {
  if (window.__native) return;
  var pending = {};
  var seq = 0;
  var listeners = [];
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
  window.__native = { platform: ${JSON.stringify(platform)}, icloud: icloud };
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

  const injectedJavaScriptBeforeContentLoaded = useMemo(
    () => buildInjectedBridge(Platform.OS, kvs !== null),
    [kvs],
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

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: BridgeRequest;
      try {
        msg = JSON.parse(event.nativeEvent.data) as BridgeRequest;
      } catch {
        return; // not our message
      }
      if (!msg || msg.__checklistBridge !== true) return;
      void handleRequest(kvs, msg, webViewRef);
    },
    [kvs, webViewRef],
  );

  return { injectedJavaScriptBeforeContentLoaded, onMessage };
}

// Perform one KVS operation and answer the parked promise in the page. Every
// failure is reported back as a rejection so the web adapter can log it rather
// than hang on a promise that never settles.
async function handleRequest(
  kvs: ReturnType<typeof getICloudKVS>,
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
