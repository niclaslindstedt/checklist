// The native half of the iCloud backend: a thin wrapper over
// `react-native-icloudstore`, which bridges Apple's `NSUbiquitousKeyValueStore`
// (iCloud key-value sync) to JS. The web app never imports this — it talks to
// the store over the `postMessage` bridge (`./nativeBridge.ts`), which calls
// in here.
//
// iCloud KVS syncs a flat string→string map across the user's signed-in Apple
// devices with no account of ours, no OAuth, and no network code — the whole
// reason this backend exists. It is **iOS-only**: the underlying native module
// isn't present on Android, so the module is `require`d lazily and only on iOS,
// and every accessor degrades to "unavailable" (null) elsewhere. That keeps a
// single build working on both platforms while offering iCloud only where it
// can exist.

import { NativeEventEmitter, NativeModule, Platform } from "react-native";

/** The minimal iCloud key-value surface the bridge drives. */
export interface ICloudKVS {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /**
   * Subscribe to changes pushed from another device. The listener receives
   * the changed keys the OS reported, or null when the platform doesn't name
   * them. Returns an unsubscribe.
   */
  onChange(listener: (changedKeys: string[] | null) => void): () => void;
}

// Resolved once: the wrapped module on iOS, or null everywhere else / when the
// native module fails to load (misconfigured entitlement, missing pod).
// `undefined` means "not resolved yet"; `null` means "resolved to unavailable".
let cached: ICloudKVS | null | undefined;

// The module is an `RCTEventEmitter`: besides the AsyncStorage-shaped
// methods it has no subscribe method of its own, and a remote change arrives
// as this event, through a `NativeEventEmitter` wrapped around the module.
const STORE_CHANGED_EVENT = "iCloudStoreDidChangeRemotely";

interface NativeICloudModule extends NativeModule {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * The iCloud key-value store, or null when it isn't available (any non-iOS
 * platform, or the native module failed to load). Memoised.
 */
export function getICloudKVS(): ICloudKVS | null {
  if (Platform.OS !== "ios") return null;
  if (cached !== undefined) return cached;
  try {
    // Lazy require so Android never evaluates the iOS-only native module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-icloudstore");
    const store = (mod.default ?? mod) as NativeICloudModule | undefined;
    if (!store) throw new Error("RNICloudStorage is not linked");
    const events = new NativeEventEmitter(store);
    cached = {
      getItem: (key) => store.getItem(key),
      setItem: (key, value) => store.setItem(key, value),
      removeItem: (key) => store.removeItem(key),
      onChange: (listener) => {
        const sub = events.addListener(
          STORE_CHANGED_EVENT,
          (event?: { changedKeys?: string[] }) => {
            listener(event?.changedKeys ?? null);
          },
        );
        return () => sub.remove();
      },
    };
  } catch (err) {
    console.warn("[icloud] native key-value store unavailable", err);
    cached = null;
  }
  return cached;
}
