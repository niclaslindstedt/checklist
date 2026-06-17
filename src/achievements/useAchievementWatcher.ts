import { useEffect, useRef } from "react";

import type { Snapshot } from "../domain/types.ts";
import type { Settings } from "../settings/types.ts";
import { drain, subscribe } from "./bus.ts";
import { ACHIEVEMENT_BY_ID } from "./catalog.ts";
import { deriveUnlocks } from "./derive.ts";
import type { AchState } from "./types.ts";

export type AchievementWatcher = {
  /** The persisted document — half of the derived-predicate input. */
  snapshot: Snapshot;
  /** The synced appearance settings — the other half, and the unlock store. */
  settings: Settings;
  /**
   * False until the active backend's first async load has resolved. Holds
   * both passes off so loading a saved document / settings never backfills
   * unlocks for things the user already had — only deltas produced after the
   * watcher is live count (the project's "forward-going only" policy, copied
   * from budget's `loaded` gate).
   */
  loaded: boolean;
  /**
   * Record freshly-earned ids (idempotent per id), returning the ids that
   * were genuinely new — `useSettings().unlockAchievements`.
   */
  record: (ids: readonly string[]) => string[];
  /** Surface the newly-unlocked ids (the unlock toast). */
  onUnlocked: (ids: string[]) => void;
};

// Mounted once inside App. Two responsibilities, mirroring budget's
// `useAchievementWatcher`:
//
// 1. After every (snapshot|settings) transition, run `deriveUnlocks` and
//    record each id whose predicate just flipped true. The pre-`loaded`
//    renders are absorbed into the baseline (prevRef tracks the current
//    state) so the seed → backend-load swap never fires backfill unlocks.
//
// 2. Subscribe to the manual-unlock bus and drain queued ids on each
//    notification, recording them the same way. Lets callers outside the
//    watcher's subtree (CopyButton, useStorageBackend, App's language
//    listener) record an unlock by calling `unlock(id)` — no prop drilling.
export function useAchievementWatcher({
  snapshot,
  settings,
  loaded,
  record,
  onUnlocked,
}: AchievementWatcher): void {
  const prevRef = useRef<AchState | null>(null);
  // Tracks whether the previous derived-pass render saw `loaded === true`.
  // The render where `loaded` first flips true also carries the hydrated
  // document (the backend load swaps the doc and flips the flag in one
  // batch), so that render must only *establish* the baseline, never derive
  // — otherwise the seed → hydrated jump backfills every unlock the user
  // already had. Reset to false whenever `loaded` drops (a backend swap) so
  // the next load re-baselines the same way.
  const wasLoaded = useRef(false);

  // Keep the latest record / onUnlocked reachable from the bus subscription
  // without re-subscribing on every render.
  const recordRef = useRef(record);
  recordRef.current = record;
  const onUnlockedRef = useRef(onUnlocked);
  onUnlockedRef.current = onUnlocked;

  // Drain the manual-unlock bus. Re-runs whenever a manual `unlock()` arrives
  // or the unlock map changes (so the recorded id checks against the latest
  // map). Held off until `loaded` — see the header.
  useEffect(() => {
    if (!loaded) return;
    const consume = () => {
      const ids = drain().filter((id) => ACHIEVEMENT_BY_ID.has(id));
      if (ids.length === 0) return;
      const newlyUnlocked = recordRef.current(ids);
      if (newlyUnlocked.length > 0) onUnlockedRef.current(newlyUnlocked);
    };
    // Drain anything queued before the listener attached (e.g. an unlock
    // fired during boot while data was still loading).
    consume();
    return subscribe(consume);
  }, [loaded, settings.achievements]);

  // Derived-trigger pass on every state delta. While loading, keep prevRef
  // aligned with the current state so the first post-load comparison treats
  // the hydrated state as the baseline rather than the placeholder seed.
  useEffect(() => {
    const nextState: AchState = { snapshot, settings };
    if (!loaded) {
      prevRef.current = nextState;
      wasLoaded.current = false;
      return;
    }
    const justLoaded = !wasLoaded.current;
    wasLoaded.current = true;
    const prev = prevRef.current;
    prevRef.current = nextState;
    // The first render after the backend load (or a backend swap) only
    // sets the baseline — the hydrated state is "what the user already had",
    // not a delta they just produced.
    if (justLoaded) return;
    if (prev === null) return;
    if (prev.snapshot === snapshot && prev.settings === settings) return;
    const fresh = deriveUnlocks(prev, nextState, settings.achievements);
    if (fresh.length === 0) return;
    const newlyUnlocked = recordRef.current(fresh);
    if (newlyUnlocked.length > 0) onUnlockedRef.current(newlyUnlocked);
  }, [snapshot, settings, loaded]);
}
