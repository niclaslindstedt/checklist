// The seam between the web app and the native wrapper it may be running
// inside. When the app is served by `native/` (an Expo WebView shell), that
// shell injects a small host object — `window.__native` — before the page
// loads. Everything here is about reading that object safely: the web build
// (GitHub Pages) has no such global, so every accessor degrades to "not
// present" and the app behaves exactly as it does in a browser.
//
// The only native capability wired today is Apple's iCloud key-value store,
// reachable through `bridge.icloud`. It speaks the same opaque-bytes contract
// the web cloud adapters do (load / save / remove by key, plus a change
// subscription), but the transport is a `postMessage` round-trip to the
// native side rather than HTTP — see `native/src/nativeBridge.ts` for the
// shim that fulfils this shape. Keeping the shape here lets the web-side
// `icloud` adapter (`./icloud/index.ts`) stay a thin translation to
// `StorageAdapter` with no knowledge of how the bridge is fulfilled.

// A stored document as the native side hands it back — the same
// text (+ optional revision) shape as `StoredSnapshot`, minus the web-only
// `offline` flag (the native KVS mirror is always local-first).
export type NativeSnapshot = {
  text: string;
  revision?: string;
};

// The iCloud key-value surface exposed by the native shell. Every method is
// async: even a local KVS read is a `postMessage` round-trip. Keys are the
// same per-namespace document keys the browser backend uses
// (`namespaceLocalKey`), so a namespace maps to one KVS entry.
export interface NativeICloud {
  /** Read the value at `key`, or null when nothing is stored there. */
  load(key: string): Promise<NativeSnapshot | null>;
  /** Write `text` at `key`, resolving with the stored snapshot. */
  save(key: string, text: string): Promise<NativeSnapshot>;
  /** Delete the value at `key` (best-effort; missing keys are a no-op). */
  remove(key: string): Promise<void>;
  /**
   * The current revision token at `key`, or null when nothing is stored.
   * NSUbiquitousKeyValueStore has no native revision concept, so the shell
   * may always resolve null; kept in the contract so a future store that
   * does carry one slots in without a shape change (and for the widgets
   * bridge in #263).
   */
  getRevision(key: string): Promise<string | null>;
  /**
   * Subscribe to out-of-band changes pushed from another device. The
   * listener receives the changed keys the OS reported, or null when the
   * platform doesn't name them (re-read everything). Returns an unsubscribe.
   */
  subscribe(listener: (changedKeys: string[] | null) => void): () => void;
}

// The native surface the Home Screen / Lock Screen widgets are driven
// through. Widgets run in a separate OS process that can't reach the WebView's
// `localStorage`, so the app mirrors a compact, derived snapshot
// (`domain/widget-snapshot.ts`) out to a shared container the widget reads —
// an App Group on iOS, `SharedPreferences`/DataStore on Android. The one
// write-back path is the interactive check-off widget, which can't touch the
// store from its own process either: its tap queues an action in the shared
// container that the app drains and applies through the normal edit path.
export interface NativeWidgets {
  /**
   * Publish the latest widget snapshot (a JSON string) to the shared
   * container and ask the OS to reload the widget timelines. Fire-and-forget
   * from the caller's view, but async so the bridge round-trip can be awaited
   * in tests.
   */
  publish(snapshotJson: string): Promise<void>;
  /**
   * Take and clear the actions a widget has queued since the last drain
   * (interactive check-off taps), as a JSON array string. Returns null or
   * "[]" when nothing is queued. The app applies each through its normal edit
   * path so the write goes through the same save / conflict handling as any
   * other edit — never a second store path.
   */
  pending(): Promise<string | null>;
  /**
   * Subscribe to be told when a widget queues a new action while the app is
   * running, so it can drain immediately rather than waiting for the next
   * foreground. Returns an unsubscribe. Optional: a platform that can't push
   * (the app drains on foreground regardless) may omit it.
   */
  subscribe?(listener: () => void): () => void;
}

// The whole injected host object. `platform` lets a capability be gated to
// one OS (iCloud is iOS-only); `icloud` is present only when the KVS is
// actually reachable (the entitlement is granted and the user is signed in),
// so its mere presence is the feature flag. `widgets` is present whenever the
// wrapper wired the widget bridge (both platforms), absent on the web build.
export interface NativeBridge {
  readonly platform: "ios" | "android";
  readonly icloud?: NativeICloud;
  readonly widgets?: NativeWidgets;
}

declare global {
  var __native: NativeBridge | undefined;
}

/**
 * The injected native bridge, or null when the app is running in a plain
 * browser (the GitHub Pages web build) rather than the native wrapper.
 * Read through this rather than touching `window.__native` directly so the
 * `typeof` guard and shape check live in one place.
 */
export function getNativeBridge(): NativeBridge | null {
  try {
    const bridge = globalThis.__native;
    if (bridge && typeof bridge === "object") return bridge;
  } catch {
    // A locked-down global (some embedded WebViews) can throw on access —
    // treat it as "no bridge" rather than crashing the module.
  }
  return null;
}

/**
 * Whether the iCloud key-value backend can be offered right now. True only
 * inside the native wrapper, on iOS, with the KVS surface actually injected
 * — so the web build (no bridge) and the Android wrapper (no `icloud`) never
 * show it. Feature-detected, never hard-coded: the settings picker and the
 * backend-preference guard both gate on this.
 */
export function isICloudAvailable(): boolean {
  const bridge = getNativeBridge();
  return (
    bridge !== null &&
    bridge.platform === "ios" &&
    typeof bridge.icloud === "object" &&
    bridge.icloud !== null
  );
}

/**
 * The iCloud surface, or null when it isn't available. A convenience over
 * `getNativeBridge()?.icloud` that funnels through {@link isICloudAvailable}
 * so callers can't accidentally reach a half-present bridge.
 */
export function getNativeICloud(): NativeICloud | null {
  return isICloudAvailable() ? (getNativeBridge()!.icloud ?? null) : null;
}

/**
 * Whether the native widget bridge is present — true only inside the native
 * wrapper (either platform), false on the web build where there is no bridge.
 * Feature-detected so the mirror hook simply does nothing on the web.
 */
export function isWidgetsAvailable(): boolean {
  const bridge = getNativeBridge();
  return (
    bridge !== null &&
    typeof bridge.widgets === "object" &&
    bridge.widgets !== null
  );
}

/**
 * The widget surface, or null when it isn't available (the web build). A
 * convenience over `getNativeBridge()?.widgets` that funnels through
 * {@link isWidgetsAvailable}.
 */
export function getNativeWidgets(): NativeWidgets | null {
  return isWidgetsAvailable() ? (getNativeBridge()!.widgets ?? null) : null;
}
