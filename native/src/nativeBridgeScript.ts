// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The page half of the native bridge (`nativeBridge.ts`): the script injected
// before the page loads, which defines `window.__native` in the shape the web
// build's `src/storage/native-bridge.ts` reads. Import-free on purpose, so the
// root suite can run it against the page's accessors
// (`tests/native/native-bridge.test.ts`) without React Native installed.

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
