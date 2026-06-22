// Storage backend contract, adapted from the budget project's adapter
// pattern. The app talks to a `StorageAdapter` instead of touching
// `localStorage` directly so cloud backends (Dropbox, Google Drive)
// can slot in later without the UI or app-state layer changing.
//
// Adapters speak bytes, not domain values: serialize / parse / migrate
// live in `./serialize.ts` and run on every load and save regardless of
// which backend is active. That keeps each adapter small and stops a
// backend from bypassing the parse pipeline. Only `BrowserLocalStorage`
// is implemented today; Dropbox / Google Drive will fill in the same
// interface.

/** A document's bytes plus the metadata a backend needs to stay coherent. */
export type StoredSnapshot = {
  // The serialized document JSON, exactly as produced by `serialize`
  // in `./serialize.ts`.
  text: string;

  // Opaque, adapter-defined token used for optimistic concurrency.
  // Dropbox returns a `rev`, Drive an ETag, a mtime works too. The
  // caller hands it back unchanged on the next save so the adapter can
  // refuse to overwrite a newer remote revision. Local backends leave
  // it undefined — nothing else writes the same key.
  revision?: string;

  // Set by adapters that can serve cached bytes when the live backend
  // is unreachable. Lets the UI tell the user they're editing a local
  // copy. The local backend never sets it.
  offline?: boolean;
};

// Optional-feature tags advertised by each adapter so UI surfaces can
// gate on capability rather than `adapter.foo !== undefined` checks.
// New backends only have to fill in the set.
export type AdapterCapability =
  // `loadSync()` is implemented — bytes can be served before first paint.
  | "loadSync"
  // `watch()` is implemented — adapter delivers out-of-band change events.
  | "watch"
  // `getRevision()` is implemented — the current revision token can be
  // fetched without downloading the full body.
  | "getRevision"
  // `probe()` is implemented — backend reachability can be re-checked with
  // a cheap call (no file bodies), so the UI can confirm an "offline" state
  // and recover from it rather than waiting for the next save / reload.
  | "probe";

export type StorageAdapter = {
  // Stable identifier so device-local settings (auth tokens, last-used
  // adapter) can be keyed per backend. `dev` is the ephemeral in-memory
  // fake-data backend used by the developer settings toggle. `icloud` is
  // the iOS-only iCloud key-value backend in the React Native app — it has
  // no web counterpart, but the id lives in the shared union so the native
  // adapter satisfies the same contract without a cast.
  readonly id: "browser" | "folder" | "dropbox" | "gdrive" | "dev" | "icloud";

  // Human-readable label for a future settings UI.
  readonly label: string;

  // Optional-feature tags this adapter supports. UI gates on
  // `capabilities.has("watch")` rather than `Boolean(adapter.watch)` so
  // a new backend slots in by editing one set.
  readonly capabilities: ReadonlySet<AdapterCapability>;

  // Optional synchronous fast path. localStorage can return data before
  // the first paint; cloud adapters cannot. Implementing this avoids a
  // one-frame empty-list flash on mount. Present iff `capabilities`
  // carries `"loadSync"`.
  loadSync?(): StoredSnapshot | null;

  // Load the current snapshot. Returns null when nothing has been
  // stored yet (first run, or an empty cloud app folder).
  load(): Promise<StoredSnapshot | null>;

  // Save the snapshot. If `baseRevision` is provided and the remote has
  // moved beyond it, the adapter must throw `ConflictError` carrying the
  // newer snapshot. Local adapters can ignore the argument.
  save(text: string, baseRevision?: string): Promise<StoredSnapshot>;

  // Optional cheap "what's the current remote revision?" probe. Returns
  // the same opaque token `load()` / `save()` put on
  // `StoredSnapshot.revision` (Dropbox `rev`, Drive ETag, …), or null
  // when nothing is stored yet. Implemented by cloud adapters whose
  // backend exposes a metadata call that returns the revision without
  // transferring the file body. Present iff `capabilities` carries
  // `"getRevision"`.
  getRevision?(): Promise<string | null>;

  // Optional lightweight reachability probe — "can I reach the backend
  // right now?" — without transferring any file body. Cloud adapters
  // implement it as a single cheap metadata call (a directory listing).
  // Resolves `true` when the backend answered, `false` when it was
  // unreachable (offline). A lapsed session is *not* "offline": the probe
  // re-throws `AuthError` so the UI can route to Reconnect instead of
  // parking in the offline state. Present iff `capabilities` carries
  // `"probe"`. Used by the "Check connection" affordance to confirm — and
  // recover from — an offline state actively, rather than trusting the
  // unreliable `navigator.onLine` flag.
  probe?(): Promise<boolean>;

  // Optional subscription to out-of-band remote changes. Cloud adapters
  // that support long-poll or push wake the app when another device
  // pushes; returns an unsubscribe function. Present iff `capabilities`
  // carries `"watch"`.
  watch?(onRemoteChange: (snapshot: StoredSnapshot) => void): () => void;

  // Milliseconds to wait after the last edit before pushing a save.
  // Defaults to 0 (save immediately) — right for localStorage. Cloud
  // adapters set this around a second to coalesce keystrokes into one
  // request.
  readonly saveDebounceMs?: number;
};

export class ConflictError extends Error {
  constructor(readonly remote: StoredSnapshot) {
    super("Remote revision moved");
    this.name = "ConflictError";
  }
}

// Thrown by cloud adapters when an HTTP 401 surfaces after any silent
// refresh has already been attempted (Dropbox) or when the access token
// has expired with no refresh path (Google Drive — GIS popup tokens are
// short-lived and don't ship a refresh token). The UI turns this into a
// "Reconnect" affordance instead of a generic "Try again" that would
// fail the same way.
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// Thrown by cloud adapters when the backend rate-limits a write (HTTP
// 429). Carries the cooldown the backend asked for (or a sensible floor)
// so the caller can back off and retry rather than surfacing a hard
// error. Saves coalesce for free during the cooldown because every save
// serialises the full document.
export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Rate limited; retry after ${retryAfterMs}ms`);
    this.name = "RateLimitError";
  }
}
