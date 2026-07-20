// The native half of the Home Screen widget bridge: a thin wrapper over the
// local `widget-bridge` Expo module (`native/modules/widget-bridge`), which
// owns the shared container the widgets read and asks the OS to reload their
// timelines. The web app never imports this — it talks to the module over the
// `postMessage` bridge (`./nativeBridge.ts`), which calls in here.
//
// Like `./icloud.ts`, the module is resolved lazily and degrades to
// "unavailable" (null) when it isn't linked, so a build without the native
// module — or a bare Expo Go run — simply offers no widgets instead of
// throwing. Widgets exist on both iOS (WidgetKit) and Android (Glance), so
// unlike iCloud there is no platform gate here.

import type { EventSubscription } from "expo-modules-core";

/** The minimal widget surface the bridge drives. */
export interface WidgetHost {
  setSnapshot(json: string): Promise<void>;
  takePendingActions(): Promise<string | null>;
  reloadAll(): Promise<void>;
  /** Subscribe to the module's "a widget queued an action" event. */
  onAction(listener: () => void): () => void;
}

// `undefined` means "not resolved yet"; `null` means "resolved to unavailable".
let cached: WidgetHost | null | undefined;

/**
 * The widget host, or null when the native module isn't available. Memoised.
 */
export function getWidgetHost(): WidgetHost | null {
  if (cached !== undefined) return cached;
  try {
    // Lazy require so a build without the module doesn't fail at import time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("../modules/widget-bridge");
    const native = (mod.default ?? mod) as {
      setSnapshot(json: string): Promise<void>;
      takePendingActions(): Promise<string | null>;
      reloadAll(): Promise<void>;
    };
    const addActionListener = mod.addActionListener as (
      listener: () => void,
    ) => EventSubscription;
    cached = {
      setSnapshot: (json) => native.setSnapshot(json),
      takePendingActions: () => native.takePendingActions(),
      reloadAll: () => native.reloadAll(),
      onAction: (listener) => {
        const sub = addActionListener(listener);
        return () => sub.remove();
      },
    };
  } catch (err) {
    console.warn("[widgets] native widget bridge unavailable", err);
    cached = null;
  }
  return cached;
}
