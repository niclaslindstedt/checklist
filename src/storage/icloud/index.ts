// The web-side iCloud backend: a `StorageAdapter` that persists the document
// through Apple's iCloud key-value store, reached over the native bridge
// (`../native-bridge.ts`) rather than an HTTP API. It is the account-less
// sync backend — no OAuth, no tokens, no network code of our own — and is
// offered only inside the iOS native wrapper, where `window.__native.icloud`
// is injected.
//
// This is the WebView-reachable heir of the previous React Native app's
// `ICloudStorageAdapter`: same contract (opaque bytes in and out, keyed per
// namespace), same `watch` capability for cross-device edits, but the store
// now lives across the `postMessage` bridge instead of in the RN process, so
// the adapter translates each call to `bridge.icloud.*`.
//
// Why key-value and not iCloud Documents: a checklist document is small and
// the store syncs itself across the user's signed-in devices with no
// credentials of our own, which keeps the adapter to the same load / save
// shape as the local one. Revisions are not modelled — NSUbiquitousKeyValueStore
// resolves cross-device writes itself (last writer wins per key), exactly as
// the RN adapter relied on — so the adapter advertises `watch` only.

import { createLogger } from "../../dev/logger.ts";
import type {
  AdapterCapability,
  StorageAdapter,
  StoredSnapshot,
} from "../adapter.ts";
import { getNativeICloud } from "../native-bridge.ts";
import { DEFAULT_NAMESPACE_SLUG, namespaceLocalKey } from "../namespaces.ts";

const log = createLogger("icloud");

export class ICloudStorageAdapter implements StorageAdapter {
  readonly id = "icloud" as const;
  readonly label = "iCloud";
  // Shared across a person's devices, so out-of-band edits are possible:
  // advertise `watch`. No `loadSync` (the bridge has no synchronous read),
  // no `getRevision` (KVS carries no revision the UI can act on).
  readonly capabilities: ReadonlySet<AdapterCapability> = new Set(["watch"]);
  // iCloud's setItem writes to the local KVS cache immediately and syncs in
  // the background, so it is cheap — but coalesce a burst of keystrokes into
  // one write the way the web cloud adapters do rather than saving on every
  // edit. A short window keeps cross-device latency low without thrashing.
  readonly saveDebounceMs = 800;

  // Reuse the local key scheme: the document lives under the same per-
  // namespace key as on-device, just in the iCloud store. iCloud KVS is a
  // flat string→string map, so there is no folder layout to mirror the web
  // cloud adapters' per-namespace folders.
  private readonly key: string;

  constructor(namespace: string = DEFAULT_NAMESPACE_SLUG) {
    this.key = namespaceLocalKey(namespace);
  }

  async load(): Promise<StoredSnapshot | null> {
    const bridge = getNativeICloud();
    if (!bridge) return null;
    try {
      const snapshot = await bridge.load(this.key);
      if (!snapshot) return null;
      return { text: snapshot.text };
    } catch (err) {
      // Treat an unreadable store (iCloud signed out, container not yet
      // provisioned) as "no data" — the parse pipeline maps that to an
      // empty document rather than crashing the load.
      log.warn(`load: [${this.key}] unavailable — treating as empty`, err);
      return null;
    }
  }

  async save(text: string): Promise<StoredSnapshot> {
    const bridge = getNativeICloud();
    if (!bridge) {
      // The bridge vanished mid-session (never expected on iOS). Surface it
      // so a silently-dropped save is debuggable; the sync engine treats a
      // thrown save as a failed write.
      throw new Error("iCloud bridge is not available");
    }
    await bridge.save(this.key, text);
    log.info(`save: wrote ${text.length} B to [${this.key}]`);
    return { text };
  }

  // iCloud pushes remote edits over the bridge's change subscription. Re-read
  // our key when a change names it (or names nothing — the platform may omit
  // the changed-key list) and deliver the fresh snapshot. Errors reading back
  // are swallowed: a transient read failure shouldn't tear down the watch.
  watch(onRemoteChange: (snapshot: StoredSnapshot) => void): () => void {
    const bridge = getNativeICloud();
    if (!bridge) return () => {};
    return bridge.subscribe((changedKeys) => {
      if (
        changedKeys &&
        changedKeys.length > 0 &&
        !changedKeys.includes(this.key)
      ) {
        return;
      }
      void this.load().then((snapshot) => {
        if (snapshot) onRemoteChange(snapshot);
      });
    });
  }
}

/**
 * Build the iCloud document adapter for a namespace. A thin factory mirroring
 * the other backends' `create*Adapter` entry points so `backend-factory.ts`
 * reads uniformly.
 */
export function createICloudAdapter(namespace: string): StorageAdapter {
  return new ICloudStorageAdapter(namespace);
}

/**
 * Whether the iCloud backend can be selected on this device — re-exported
 * from the bridge so importers reach one storage module. See
 * {@link isICloudAvailable}.
 */
export { isICloudAvailable } from "../native-bridge.ts";

/**
 * Delete a namespace's document from the iCloud store. Best-effort: a missing
 * bridge or key is a no-op. Used when a namespace is removed while iCloud is
 * the active backend, so its bytes don't linger in the shared store.
 */
export async function deleteICloudNamespace(namespace: string): Promise<void> {
  const bridge = getNativeICloud();
  if (!bridge) return;
  try {
    await bridge.remove(namespaceLocalKey(namespace));
  } catch (err) {
    log.warn(`deleteICloudNamespace: remove failed for ${namespace}`, err);
  }
}
