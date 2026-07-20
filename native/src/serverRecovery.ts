// Pure decision logic for the embedded static server's lifecycle, factored out
// of `useStaticServer` so it can be unit-tested without the react-native
// runtime. Nothing here may import react-native or the static-server library —
// the hook translates the live server into these plain inputs and acts on the
// returned verdict.

export type ServerStatus = "starting" | "ready" | "failed";

// What to do with the embedded server when the app returns to the foreground.
//
// - `restart` — the server needs to be (re)started: it never came up (a
//   transient port clash on cold start), or iOS closed its listening socket
//   while we were backgrounded and it is no longer alive. Either way the
//   WebView is pointing at a dead origin.
// - `resync`  — the server is alive but the OS/library rebound it to a
//   different port while we were away, so the origin we hold is stale; adopt
//   the live origin and let the WebView reload onto it.
// - `none`    — nothing to do: the server is up on the origin we already hold,
//   or a start is still in flight and will resolve on its own.
export type ForegroundAction = "restart" | "resync" | "none";

// The live state of the server as observed at foreground time. `alive` is true
// only when a running instance reports itself active; `origin` is that
// instance's current origin (null when there is no running instance).
export type LiveServer = {
  alive: boolean;
  origin: string | null;
};

/**
 * Decide what to do with the embedded server on foreground.
 *
 * `starting` is always left alone — an in-flight start resolves on its own,
 * and kicking a second start would trip the library's one-instance-per-process
 * rule. A `failed` boot is always retried. A `ready` server is restarted when
 * it is no longer alive, resynced when it moved to a new port, and left be
 * otherwise.
 */
export function foregroundServerAction(
  status: ServerStatus,
  live: LiveServer,
  currentOrigin: string | null,
): ForegroundAction {
  if (status === "starting") return "none";
  if (status === "failed") return "restart";
  // status === "ready"
  if (!live.alive) return "restart";
  if (live.origin !== null && live.origin !== currentOrigin) return "resync";
  return "none";
}
