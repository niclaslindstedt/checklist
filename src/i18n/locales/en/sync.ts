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
  offline: "Offline — editing a local copy",

  // Cloud-sync details modal — opened from the header cloud button. It
  // spells out *what* the sync is doing and, when something went wrong,
  // *why*, so a failed save is no longer a silent red glyph.
  cloudSync: "Cloud sync",
  status: "Status",
  provider: "Provider",
  fileLocation: "File location",
  openIn: "Open in {name}",
  reconnect: "Reconnect {name}",
  tryAgain: "Try again",
  saveNow: "Save now",

  // The "Check connection" affordance shown while offline, plus the live
  // status messages it cycles through so the user sees *what's happening*
  // instead of a button that seems to do nothing.
  checkConnection: "Check connection",
  checkPinging: "Reaching {name}…",
  checkStillOffline:
    "Still can't reach {name}. Your edits are saved on this device and will sync automatically once you're back online.",
  checkAuthExpired:
    "Your session with {name} has expired — reconnect to continue.",

  // Per-state heading shown in the modal's status block, plus the
  // explanatory "what / why" line beneath it.
  syncingNow: "Saving your changes…",
  failedHeading: "Sync failed",
  failedDetailFallback:
    "The last save to {name} didn't go through. Try again — and if it keeps failing, check your connection.",
  throttledHeading: "Rate limited",
  throttledDetail:
    "{name} is asking the app to slow down. Saving will resume automatically in a moment.",
  reauthHeading: "Reconnect needed",
  reauthDetail:
    "Your session with {name} has expired. Reconnect to keep saving.",
  conflictHeading: "Sync conflict",
  conflictDetail:
    "Another device saved a newer version. Open the list to pick which copy to keep.",
  pendingHeading: "Waiting to sync",
  pendingDetail: "Your latest edits aren't saved to {name} yet.",
  offlineHeading: "Offline",
  offlineDetail:
    "Can't reach {name} right now, so you're working on the copy saved on this device. Any changes are kept locally and sync automatically when you're back online.",

  // The cloud-sync command centre: the compact Reload glyph, the
  // backend / encryption details grid, and the always-on sync log.
  reloadFromBackend: "Reload from the backend",
  backend: "Backend",
  encryptionLabel: "Encryption",
  encryptionOn: "On",
  encryptionOff: "Off",
  viewSyncLog: "View sync log",
  hideSyncLog: "Hide sync log",
  syncLogEmpty: "No sync activity logged yet.",
  copyLog: "Copy",
  copied: "Copied",
  copyFailed: "Copy failed",
} as const;

export type SyncCatalog = Widen<typeof sync>;

export default sync;
