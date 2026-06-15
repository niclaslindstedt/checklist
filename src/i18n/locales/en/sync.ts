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
} as const;

export type SyncCatalog = Widen<typeof sync>;

export default sync;
