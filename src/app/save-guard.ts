// A tiny module-level registry that lets chrome living OUTSIDE the
// checklist tree — most importantly the PWA update flow in
// `src/pwa/usePwaUpdate.ts` — ask "does the app hold edits that haven't
// reached the backend yet?" and get them flushed before doing anything
// that tears the page down (applying a waiting service worker reloads the
// window).
//
// Why a singleton and not context: the sync engine (`useChecklistSync`)
// lives under `App`, while the update toast is mounted by `LanguageRoot`
// above it and the `controlling` listener isn't a component at all. The
// registry mirrors how `usePwaUpdate` itself shares state across mount
// points. Cloud backends debounce saves (and hold the unsaved snapshot in
// an in-memory queue), so a reload in that window would silently drop the
// edit — the "add an item, update the app, item gone" bug.

export type SaveGuard = {
  /** Whether this producer holds edits not yet persisted to its backend. */
  hasUnsaved: () => boolean;
  /** Push any debounced / queued edit to the backend immediately. */
  flush: () => void;
};

const guards = new Set<SaveGuard>();

/** How often `settleSaves` re-checks the guards while waiting. */
export const SETTLE_POLL_MS = 100;

/** Register a producer of unsaved edits; returns the unregister handle. */
export function registerSaveGuard(guard: SaveGuard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

/** Whether any registered producer holds edits not yet persisted. */
export function hasUnsavedChanges(): boolean {
  for (const guard of guards) {
    if (guard.hasUnsaved()) return true;
  }
  return false;
}

/**
 * Flush every registered guard and wait until none reports unsaved edits.
 * Resolves `true` once everything settled, `false` if `timeoutMs` elapsed
 * first (backend erroring or throttled mid-cooldown) — the caller must NOT
 * proceed with anything destructive on `false`, the edits are still only
 * in memory.
 */
export function settleSaves(timeoutMs: number): Promise<boolean> {
  for (const guard of guards) guard.flush();
  if (!hasUnsavedChanges()) return Promise.resolve(true);
  // Count polls rather than wall-clock time so the wait is deterministic
  // under fake timers and immune to clock adjustments.
  const maxPolls = Math.max(1, Math.ceil(timeoutMs / SETTLE_POLL_MS));
  return new Promise((resolve) => {
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (!hasUnsavedChanges()) {
        clearInterval(timer);
        resolve(true);
      } else if (polls >= maxPolls) {
        clearInterval(timer);
        resolve(false);
      }
    }, SETTLE_POLL_MS);
  });
}
