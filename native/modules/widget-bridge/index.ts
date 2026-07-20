// JS surface of the local `widget-bridge` Expo module. It carries the derived
// widget snapshot across the app ↔ extension process boundary through the
// platform's shared container (an App Group on iOS, a shared `SharedPreferences`
// file on Android) and asks the OS to reload the widget timelines. It also
// drains the actions the interactive check-off widget queued while the app was
// away, and emits an event when a fresh one arrives so the app can apply it
// live.
//
// This module runs in the *app* process. The widget extension is a separate
// native target (`native/widgets/`) that reads the same container — it is not
// imported here. Everything is guarded so a build without the native module
// (or a platform where it failed to load) degrades to "no widgets" rather than
// throwing; `native/src/widgets.ts` owns that guard.

import {
  NativeModule,
  requireNativeModule,
  type EventSubscription,
} from "expo-modules-core";

// The App Group / shared-prefs identifier both the app and the widget
// extension address. Changing it after release orphans every installed
// widget's data, so it is pinned here and in the native targets / entitlements.
export const APP_GROUP = "group.se.niclaslindstedt.checklist";

// The events the native module emits. `onWidgetAction` fires (iOS only) when
// the extension queues a check-off action while the app is running.
type WidgetBridgeEvents = {
  onWidgetAction: () => void;
};

// In SDK 53 a native module *is* an `EventEmitter`, so `addListener` is
// available directly on the resolved module.
declare class WidgetBridgeNativeModule extends NativeModule<WidgetBridgeEvents> {
  /** Write the snapshot JSON into the shared container and reload timelines. */
  setSnapshot(json: string): Promise<void>;
  /** Take and clear the queued widget actions as a JSON array string (or null). */
  takePendingActions(): Promise<string | null>;
  /** Reload every widget timeline without changing the snapshot. */
  reloadAll(): Promise<void>;
}

// `requireNativeModule` throws if the native side isn't linked; the caller
// (`native/src/widgets.ts`) catches that and reports the capability absent.
const native =
  requireNativeModule<WidgetBridgeNativeModule>("WidgetBridgeModule");

/** Fired when the widget extension queues a new action while the app runs. */
export function addActionListener(listener: () => void): EventSubscription {
  return native.addListener("onWidgetAction", listener);
}

export default native;
