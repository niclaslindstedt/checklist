import type { Widen } from "./_widen";

// Strings for cloud-sync conflict resolution — shown when a save
// collides with a newer copy of the document on the backend.

const sync = {
  conflictTitle: "This list changed elsewhere",
  conflictHint:
    "Another device saved a different version of this list. Pick which copy to keep — there's no automatic merge.",
  conflictLocalLabel: "This device",
  conflictRemoteLabel: "The other copy",
  conflictCounts: "{lists} lists · {items} items",
  keepLocal: "Keep this device's",
  keepRemote: "Keep the other",

  // Cloud-sync status glyph in the header.
  saving: "Saving…",
  syncedTo: "Synced to {name}",
  saveUnsaved: "Unsaved changes — tap to save now",
  failed: "Sync failed — tap for details",
  throttled: "Slow down — the backend is rate-limiting saves",
  reauthRequired: "Reconnect needed — tap to fix",
  syncConflict: "Sync conflict — tap to resolve",
} as const;

export type SyncCatalog = Widen<typeof sync>;

export default sync;
